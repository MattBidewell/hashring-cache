import { HashRing, fnv1a } from "../packages/consistent-hash/dist/src/index.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_HASH = 0xffffffff;
const SAMPLE_KEY_COUNT = 512;
const REPLICA_COUNT = 3;
const DEFAULT_VIRTUAL_NODES = 12;
const palette = [
  "#1d6b72",
  "#d26d4f",
  "#6b8f3e",
  "#8b5fbf",
  "#cb8f2d",
  "#2c5f9e",
  "#b24d6b",
  "#4b8078",
];

const state = {
  ring: createRing(),
  nodes: [],
  key: "user:123",
  nodeCounter: 4,
  history: [],
  transition: null,
};

let transitionTimer = null;

const sampleKeys = Array.from({ length: SAMPLE_KEY_COUNT }, (_, index) => `sample-key-${index}`);

const elements = {
  addNodeForm: document.querySelector("#add-node-form"),
  nodeId: document.querySelector("#node-id"),
  nodeWeight: document.querySelector("#node-weight"),
  probeKey: document.querySelector("#probe-key"),
  nodeList: document.querySelector("#node-list"),
  replicaList: document.querySelector("#replica-list"),
  historyList: document.querySelector("#history-list"),
  ownershipList: document.querySelector("#ownership-list"),
  changeBanner: document.querySelector("#change-banner"),
  changeList: document.querySelector("#change-list"),
  randomNodeButton: document.querySelector("#random-node-button"),
  topStats: document.querySelector("#top-stats"),
  ringSvg: document.querySelector("#ring-svg"),
  stripSvg: document.querySelector("#strip-svg"),
};

bootstrap();

function bootstrap() {
  seedNode({ id: "cache-sfo-1", weight: 1 });
  seedNode({ id: "cache-iad-1", weight: 1 });
  seedNode({ id: "cache-fra-1", weight: 2 });

  pushHistory({
    action: "Initial ring",
    summary: "Seeded 3 nodes so you can see weighted ownership immediately.",
    movedRatio: 0,
    changedKeys: 0,
    ownerShift: "Virtual node positions are deterministic: hash(nodeId:vnodeIndex).",
  });

  elements.nodeId.value = createSuggestedNodeId();
  elements.probeKey.value = state.key;

  elements.addNodeForm.addEventListener("submit", handleAddNode);
  elements.randomNodeButton.addEventListener("click", handleAddRandomNode);
  elements.probeKey.addEventListener("input", handleProbeKeyInput);

  render();
}

function createRing() {
  return new HashRing({
    getNodeId: (node) => node.id,
    virtualNodes: DEFAULT_VIRTUAL_NODES,
  });
}

function seedNode({ id, weight }) {
  const node = buildNode(id, weight);
  state.nodes.push(node);
  state.ring.addNode(node, weight);
}

function buildNode(id, weight) {
  return {
    id,
    label: id,
    weight,
    color: palette[state.nodes.length % palette.length],
  };
}

function handleAddNode(event) {
  event.preventDefault();

  const id = elements.nodeId.value.trim();
  const weight = Number(elements.nodeWeight.value);

  if (!id || !Number.isFinite(weight) || weight <= 0) {
    return;
  }

  applyRingChange(`Added ${id}`, () => {
    const existingIndex = state.nodes.findIndex((node) => node.id === id);

    if (existingIndex >= 0) {
      const current = state.nodes[existingIndex];
      const updated = { ...current, weight };
      state.nodes.splice(existingIndex, 1, updated);
      state.ring.addNode(updated, weight);
      return `Updated existing node ${id} to weight ${weight}.`;
    }

    const node = buildNode(id, weight);
    state.nodes.push(node);
    state.ring.addNode(node, weight);
    state.nodeCounter += 1;
    return `Introduced ${id} with weight ${weight}, expanding its share of the ring.`;
  });

  elements.addNodeForm.reset();
  elements.nodeWeight.value = "1";
  elements.nodeId.value = createSuggestedNodeId();
}

function handleAddRandomNode() {
  const id = createSuggestedNodeId();
  const weight = [0.75, 1, 1, 1.25, 1.5, 2][Math.floor(Math.random() * 6)];

  elements.nodeId.value = id;
  elements.nodeWeight.value = String(weight);

  applyRingChange(`Added ${id}`, () => {
    const node = buildNode(id, weight);
    state.nodes.push(node);
    state.ring.addNode(node, weight);
    state.nodeCounter += 1;
    return `Added ${id} with weight ${weight} to create a fresh set of virtual nodes.`;
  });

  elements.nodeId.value = createSuggestedNodeId();
  elements.nodeWeight.value = "1";
}

function handleProbeKeyInput(event) {
  state.key = event.currentTarget.value || "user:123";
  render();
}

function removeNode(nodeId) {
  const node = state.nodes.find((entry) => entry.id === nodeId);

  if (!node) {
    return;
  }

  applyRingChange(`Removed ${nodeId}`, () => {
    state.nodes = state.nodes.filter((entry) => entry.id !== nodeId);
    state.ring.removeNode({ id: nodeId });
    return `Removed ${nodeId}; only its clockwise ranges had to move.`;
  });
}

function applyRingChange(action, mutate) {
  const beforeSnapshot = state.ring.snapshot();
  const beforeAssignments = captureAssignments();
  const beforeOwner = state.ring.getNode(state.key)?.id ?? null;
  const summary = mutate();
  const afterSnapshot = state.ring.snapshot();
  const afterAssignments = captureAssignments();
  const afterOwner = state.ring.getNode(state.key)?.id ?? null;
  const diff = diffAssignments(beforeAssignments, afterAssignments);
  const transition = createTransition(beforeSnapshot, afterSnapshot);

  setTransition(transition);

  pushHistory({
    action,
    summary,
    movedRatio: diff.movedRatio,
    changedKeys: diff.changedKeys,
    ownerShift:
      beforeOwner && afterOwner && beforeOwner !== afterOwner
        ? `${state.key} moved from ${beforeOwner} to ${afterOwner}.`
        : afterOwner
          ? `${state.key} now resolves to ${afterOwner}.`
          : "No owner available for the current key.",
  });

  render();
}

function captureAssignments() {
  return new Map(sampleKeys.map((key) => [key, state.ring.getNode(key)?.id ?? null]));
}

function diffAssignments(before, after) {
  let changedKeys = 0;

  for (const [key, owner] of before) {
    if (after.get(key) !== owner) {
      changedKeys += 1;
    }
  }

  return {
    changedKeys,
    movedRatio: changedKeys / SAMPLE_KEY_COUNT,
  };
}

function pushHistory(entry) {
  state.history.unshift({
    ...entry,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  });
  state.history = state.history.slice(0, 8);
}

function render() {
  const snapshot = state.ring.snapshot();
  const ownership = computeOwnership(snapshot);
  renderStats(snapshot);
  renderNodes(snapshot);
  renderReplicas();
  renderHistory();
  renderOwnership(snapshot, ownership);
  renderBanner();
  renderChangeList();
  renderRing(snapshot);
  renderHashStrip(snapshot, ownership);
}

function renderStats(snapshot) {
  const owner = state.ring.getNode(state.key);
  const totalWeight = state.nodes.reduce((sum, node) => sum + node.weight, 0);

  elements.topStats.innerHTML = [
    statCard("Nodes", String(snapshot.nodeCount)),
    statCard("Virtual nodes", String(snapshot.ringSize)),
    statCard("Current owner", owner?.id ?? "none"),
    statCard("Total weight", totalWeight.toFixed(2).replace(/\.00$/, "")),
  ].join("");
}

function statCard(label, value) {
  return `<article class="stat"><span class="label">${label}</span><span class="value">${value}</span></article>`;
}

function renderNodes(snapshot) {
  if (state.nodes.length === 0) {
    elements.nodeList.innerHTML = '<p class="empty">No nodes yet.</p>';
    return;
  }

  const byId = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));

  elements.nodeList.innerHTML = state.nodes
    .map((node) => {
      const nodeSnapshot = byId.get(node.id);

      return `
        <article class="node-item">
          <div class="node-top">
            <div class="pill-row">
              <span class="swatch" style="background:${node.color}"></span>
              <span class="node-id">${node.id}</span>
            </div>
            <button class="ghost" data-remove-node="${node.id}" type="button">Remove</button>
          </div>
          <div class="node-meta subtle">
            <span>weight ${node.weight}</span>
            <span>${nodeSnapshot?.virtualNodeCount ?? 0} virtual nodes</span>
          </div>
        </article>
      `;
    })
    .join("");

  for (const button of elements.nodeList.querySelectorAll("[data-remove-node]")) {
    button.addEventListener("click", () => removeNode(button.getAttribute("data-remove-node")));
  }
}

function renderReplicas() {
  const replicas = state.ring.getNodes(state.key, REPLICA_COUNT);

  if (replicas.length === 0) {
    elements.replicaList.innerHTML =
      '<p class="empty">Add at least one node to resolve this key.</p>';
    return;
  }

  elements.replicaList.innerHTML = replicas
    .map((node, index) => {
      const color = state.nodes.find((entry) => entry.id === node.id)?.color ?? "#1d6b72";

      return `
        <article class="replica-item">
          <div class="replica-top">
            <div class="pill-row">
              <span class="swatch" style="background:${color}"></span>
              <span class="replica-id">${node.id}</span>
            </div>
            <span class="pill">replica ${index + 1}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHistory() {
  elements.historyList.innerHTML = state.history
    .map(
      (entry) => `
        <article class="history-item">
          <div class="history-top">
            <strong>${entry.action}</strong>
            <span class="caption">${entry.timestamp}</span>
          </div>
          <p class="subtle">${entry.summary}</p>
          <div class="pill-row" style="margin-top:0.6rem;">
            <span class="pill">${entry.changedKeys} / ${SAMPLE_KEY_COUNT} sample keys moved</span>
            <span class="pill">${Math.round(entry.movedRatio * 1000) / 10}% remapped</span>
          </div>
          <p class="caption" style="margin-top:0.55rem;">${entry.ownerShift ?? ""}</p>
        </article>
      `,
    )
    .join("");
}

function renderOwnership(snapshot, ownership) {
  if (snapshot.nodeCount === 0) {
    elements.ownershipList.innerHTML =
      '<p class="empty">Ownership appears once the first node joins.</p>';
    return;
  }

  elements.ownershipList.innerHTML = state.nodes
    .map((node) => {
      const share = ownership.get(node.id) ?? 0;
      const vnodeCount =
        snapshot.nodes.find((entry) => entry.nodeId === node.id)?.virtualNodeCount ?? 0;

      return `
        <article class="node-item">
          <div class="node-top">
            <div class="pill-row">
              <span class="swatch" style="background:${node.color}"></span>
              <strong>${node.id}</strong>
            </div>
             <span class="pill">${(share * 100).toFixed(1)}%</span>
           </div>
          <p class="subtle">Owns ${(share * 100).toFixed(1)}% of the hash space with weight ${node.weight} and ${vnodeCount} virtual nodes.</p>
        </article>
      `;
    })
    .join("");
}

function renderBanner() {
  const latest = state.history[0];
  const transitionCopy = state.transition
    ? `<p class="caption" style="margin-top:0.55rem;">${state.transition.changedIntervals.length} ownership ranges changed. The thin strip above the main bar shows who used to own those ranges.</p>`
    : "";

  elements.changeBanner.innerHTML = latest
    ? `<strong>${latest.action}</strong><p>${latest.summary}</p><p class="caption" style="margin-top:0.55rem;">${latest.ownerShift}</p>${transitionCopy}`
    : "<strong>Ready</strong><p>Start by adding a node to the ring.</p>";
}

function renderChangeList() {
  if (!state.transition || state.transition.changedIntervals.length === 0) {
    elements.changeList.innerHTML = "";
    return;
  }

  elements.changeList.innerHTML = state.transition.changedIntervals
    .slice(0, 5)
    .map((interval) => {
      const percentage = ((interval.end - interval.start) * 100).toFixed(2);
      return `
        <article class="change-chip">
          <strong>${interval.beforeOwner ?? "none"} -> ${interval.afterOwner ?? "none"}</strong>
          <p class="caption">${percentage}% of the hash space changed owner in this interval.</p>
        </article>
      `;
    })
    .join("");
}

function renderRing(snapshot) {
  const svg = elements.ringSvg;
  svg.innerHTML = "";

  const center = 450;
  const segmentRadius = 246;
  const previousRadius = 286;
  const highlightRadius = 262;
  const vnodeRadius = 292;
  const pointerRadius = 330;
  const owner = state.ring.getNode(state.key);
  const keyPosition = fnv1a(state.key) / MAX_HASH;
  const ownerId = owner?.id ?? null;

  append(svg, createCircle(center, center, pointerRadius + 26, "rgba(255,255,255,0.38)", "none"));
  append(svg, createCircle(center, center, segmentRadius, "none", "rgba(27,36,48,0.08)", 28));
  append(svg, createCircle(center, center, vnodeRadius, "none", "rgba(27,36,48,0.06)", 3));

  if (snapshot.entries.length === 0) {
    append(
      svg,
      createText(center, center - 18, "No nodes on the ring yet", "middle", 32, "#1b2430"),
    );
    append(
      svg,
      createText(
        center,
        center + 26,
        "Add one from the left panel to create the first ownership slice.",
        "middle",
        18,
        "#5e655d",
      ),
    );
    return;
  }

  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const current = snapshot.entries[index];
    const previous =
      snapshot.entries[(index - 1 + snapshot.entries.length) % snapshot.entries.length];
    const start = previous.position / MAX_HASH;
    const end = current.position / MAX_HASH;
    const node = state.nodes.find((entry) => entry.id === current.nodeId);
    const opacity = current.nodeId === ownerId ? 0.92 : 0.4;

    append(
      svg,
      createPath(
        describeArc(center, center, segmentRadius, start, end),
        "none",
        node?.color ?? "#1d6b72",
        current.nodeId === ownerId ? 30 : 20,
        opacity,
      ),
    );
  }

  if (state.transition) {
    for (const interval of state.transition.changedIntervals) {
      append(
        svg,
        createPath(
          describeArc(center, center, previousRadius, interval.start, interval.end),
          "none",
          colorForNode(interval.beforeOwner) ?? "rgba(27,36,48,0.35)",
          8,
          0.5,
          "interval-before",
          "10 10",
        ),
      );
      append(
        svg,
        createPath(
          describeArc(center, center, highlightRadius, interval.start, interval.end),
          "none",
          colorForNode(interval.afterOwner) ?? "#d6a141",
          6,
          0.95,
          "interval-after",
        ),
      );
    }
  }

  for (const entry of snapshot.entries) {
    const node = state.nodes.find((candidate) => candidate.id === entry.nodeId);
    const point = pointOnCircle(center, center, vnodeRadius, entry.position / MAX_HASH);

    append(
      svg,
      createCircle(point.x, point.y, 5.6, node?.color ?? "#1d6b72", "rgba(255,255,255,0.8)", 2),
    );
  }

  const keyPoint = pointOnCircle(center, center, pointerRadius, keyPosition);
  const pointerLine = document.createElementNS(SVG_NS, "line");
  pointerLine.setAttribute("x1", String(center));
  pointerLine.setAttribute("y1", String(center));
  pointerLine.setAttribute("x2", String(keyPoint.x));
  pointerLine.setAttribute("y2", String(keyPoint.y));
  pointerLine.setAttribute("stroke", "rgba(27,36,48,0.2)");
  pointerLine.setAttribute("stroke-width", "2");
  pointerLine.setAttribute("stroke-dasharray", "8 10");
  append(svg, pointerLine);

  append(svg, createDiamond(keyPoint.x, keyPoint.y, 12, ownerId ? "#1b2430" : "#8a8f88"));
  append(svg, createText(center, center - 8, state.key, "middle", 26, "#1b2430"));
  append(
    svg,
    createText(
      center,
      center + 28,
      ownerId ? `owned by ${ownerId}` : "no owner",
      "middle",
      18,
      "#5e655d",
    ),
  );

  for (const [index, node] of state.nodes.entries()) {
    const angle = index / Math.max(state.nodes.length, 1);
    const labelPoint = pointOnCircle(center, center, pointerRadius + 34, angle);
    append(
      svg,
      createCircle(labelPoint.x, labelPoint.y, 10, node.color, "rgba(255,255,255,0.7)", 3),
    );
    append(
      svg,
      createText(
        labelPoint.x,
        labelPoint.y + 28,
        node.id,
        "middle",
        15,
        node.id === ownerId ? "#1b2430" : "#5e655d",
      ),
    );
  }

  append(
    svg,
    createText(
      center,
      58,
      state.transition
        ? "Thin dashed arcs show who used to own each remapped range. The bright trim marks where the current ring changed."
        : "Outer dots = virtual node points. Inner band = ownership ranges between points.",
      "middle",
      18,
      "#5e655d",
    ),
  );
}

function renderHashStrip(snapshot, ownership) {
  const svg = elements.stripSvg;
  svg.innerHTML = "";

  const startX = 70;
  const endX = 830;
  const width = endX - startX;
  const keyRatio = fnv1a(state.key) / MAX_HASH;
  const ownerId = state.ring.getNode(state.key)?.id ?? null;
  const barY = 92;
  const barHeight = 42;
  const ghostY = 56;
  const ghostHeight = 14;

  append(svg, createText(startX, 30, "0", "start", 14, "#5e655d"));
  append(svg, createText(endX, 30, String(MAX_HASH), "end", 14, "#5e655d"));

  if (snapshot.entries.length === 0) {
    append(
      svg,
      createText(450, 110, "Add a node to populate the hash space.", "middle", 18, "#5e655d"),
    );
    return;
  }

  append(
    svg,
    createRect(
      startX,
      barY,
      width,
      barHeight,
      "rgba(255,255,255,0.72)",
      "rgba(27,36,48,0.1)",
      1,
      "",
      16,
    ),
  );

  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const current = snapshot.entries[index];
    const previous =
      snapshot.entries[(index - 1 + snapshot.entries.length) % snapshot.entries.length];
    const startRatio = previous.position / MAX_HASH;
    const endRatio = current.position / MAX_HASH;
    const fill = colorForNode(current.nodeId) ?? "#1d6b72";
    const opacity = current.nodeId === ownerId ? 0.92 : 0.56;

    appendWrappedRect(svg, startX, barY, width, barHeight, startRatio, endRatio, fill, opacity);
  }

  for (const entry of snapshot.entries) {
    const ratio = entry.position / MAX_HASH;
    const x = startX + ratio * width;
    const tick = document.createElementNS(SVG_NS, "line");
    tick.setAttribute("x1", String(x));
    tick.setAttribute("x2", String(x));
    tick.setAttribute("y1", String(barY - 7));
    tick.setAttribute("y2", String(barY + barHeight + 7));
    tick.setAttribute("stroke", "rgba(27,36,48,0.18)");
    tick.setAttribute("stroke-width", "1");
    append(svg, tick);
  }

  if (state.transition) {
    append(
      svg,
      createText(
        startX,
        ghostY - 8,
        "Previous owners of remapped intervals",
        "start",
        12,
        "#5e655d",
      ),
    );

    for (const interval of state.transition.changedIntervals) {
      appendWrappedRect(
        svg,
        startX,
        ghostY,
        width,
        ghostHeight,
        interval.start,
        interval.end,
        colorForNode(interval.beforeOwner) ?? "rgba(27,36,48,0.25)",
        0.6,
        "rgba(27,36,48,0.06)",
        1,
        "interval-before",
      );

      appendWrappedRect(
        svg,
        startX,
        barY - 6,
        width,
        barHeight + 12,
        interval.start,
        interval.end,
        "rgba(0,0,0,0)",
        1,
        colorForNode(interval.afterOwner) ?? "#d6a141",
        3,
        "interval-after",
      );
    }
  }

  const keyX = startX + keyRatio * width;
  const keyMarker = document.createElementNS(SVG_NS, "line");
  keyMarker.setAttribute("x1", String(keyX));
  keyMarker.setAttribute("x2", String(keyX));
  keyMarker.setAttribute("y1", String(ghostY - 18));
  keyMarker.setAttribute("y2", String(barY + barHeight + 16));
  keyMarker.setAttribute("stroke", "#1b2430");
  keyMarker.setAttribute("stroke-width", "2");
  append(svg, keyMarker);

  append(svg, createText(keyX, ghostY - 24, state.key, "middle", 14, "#1b2430"));

  let legendX = startX;
  for (const node of state.nodes) {
    const share = ownership.get(node.id) ?? 0;
    append(svg, createCircle(legendX, 182, 6, node.color, "none"));
    append(
      svg,
      createText(
        legendX + 12,
        187,
        `${node.id} ${(share * 100).toFixed(1)}%`,
        "start",
        14,
        node.id === ownerId ? "#1b2430" : "#5e655d",
      ),
    );
    legendX += 160;
  }
}

function setTransition(transition) {
  state.transition = transition;

  if (transitionTimer) {
    clearTimeout(transitionTimer);
  }

  transitionTimer = setTimeout(() => {
    state.transition = null;
    render();
  }, 4500);
}

function createTransition(beforeSnapshot, afterSnapshot) {
  const boundaries = new Set([0, 1]);

  for (const entry of beforeSnapshot.entries) {
    boundaries.add(entry.position / MAX_HASH);
  }

  for (const entry of afterSnapshot.entries) {
    boundaries.add(entry.position / MAX_HASH);
  }

  const sortedBoundaries = Array.from(boundaries).sort((left, right) => left - right);
  const changedIntervals = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];

    if (end - start <= 0) {
      continue;
    }

    const probe = start + (end - start) / 2;
    const beforeOwner = ownerAtRatio(beforeSnapshot, probe);
    const afterOwner = ownerAtRatio(afterSnapshot, probe);

    if (beforeOwner !== afterOwner) {
      const previous = changedIntervals[changedIntervals.length - 1];

      if (
        previous &&
        previous.end === start &&
        previous.beforeOwner === beforeOwner &&
        previous.afterOwner === afterOwner
      ) {
        previous.end = end;
      } else {
        changedIntervals.push({ start, end, beforeOwner, afterOwner });
      }
    }
  }

  return {
    beforeSnapshot,
    afterSnapshot,
    changedIntervals,
    nodeColors: new Map(
      [...beforeSnapshot.nodes, ...afterSnapshot.nodes].map((node) => [
        node.nodeId,
        node.node.color,
      ]),
    ),
  };
}

function ownerAtRatio(snapshot, ratio) {
  if (snapshot.entries.length === 0) {
    return null;
  }

  const target = ratio * MAX_HASH;

  for (const entry of snapshot.entries) {
    if (entry.position >= target) {
      return entry.nodeId;
    }
  }

  return snapshot.entries[0]?.nodeId ?? null;
}

function colorForNode(nodeId) {
  return (
    state.nodes.find((node) => node.id === nodeId)?.color ??
    state.transition?.nodeColors.get(nodeId)
  );
}

function computeOwnership(snapshot) {
  const ownership = new Map();

  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const current = snapshot.entries[index];
    const previous =
      snapshot.entries[(index - 1 + snapshot.entries.length) % snapshot.entries.length];
    const start = previous.position / MAX_HASH;
    const end = current.position / MAX_HASH;
    const span = normalizedSpan(start, end);
    ownership.set(current.nodeId, (ownership.get(current.nodeId) ?? 0) + span);
  }

  return ownership;
}

function createSuggestedNodeId() {
  const region = ["syd", "gru", "iad", "sin", "fra", "sjc"][state.nodeCounter % 6];
  return `cache-${region}-${state.nodeCounter}`;
}

function normalizedSpan(start, end) {
  return end >= start ? end - start : 1 - start + end;
}

function angleFor(normalized) {
  return -90 + normalized * 360;
}

function pointOnCircle(cx, cy, radius, normalized) {
  const angle = (angleFor(normalized) * Math.PI) / 180;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function describeArc(cx, cy, radius, start, end) {
  const arcSpan = normalizedSpan(start, end);
  const startPoint = pointOnCircle(cx, cy, radius, start);
  const endPoint = pointOnCircle(cx, cy, radius, end);
  const largeArcFlag = arcSpan > 0.5 ? 1 : 0;

  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPoint.x} ${endPoint.y}`;
}

function appendWrappedRect(
  svg,
  startX,
  y,
  width,
  height,
  startRatio,
  endRatio,
  fill,
  opacity,
  stroke = "none",
  strokeWidth = 0,
  className = "",
) {
  const appendSegment = (segmentX, segmentWidth) => {
    append(
      svg,
      createRect(
        segmentX,
        y,
        Math.max(segmentWidth, 1.25),
        height,
        fill,
        stroke,
        strokeWidth,
        className,
        10,
        opacity,
      ),
    );
  };

  const segmentStart = startX + startRatio * width;

  if (endRatio >= startRatio) {
    appendSegment(segmentStart, (endRatio - startRatio) * width);
    return;
  }

  appendSegment(segmentStart, startX + width - segmentStart);
  appendSegment(startX, endRatio * width);
}

function createCircle(cx, cy, radius, fill, stroke, strokeWidth = 0, className = "") {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(radius));
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", stroke);
  circle.setAttribute("stroke-width", String(strokeWidth));

  if (className) {
    circle.setAttribute("class", className);
  }

  return circle;
}

function createPath(d, fill, stroke, strokeWidth, opacity = 1, className = "", dasharray = "") {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", fill);
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", String(strokeWidth));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("opacity", String(opacity));

  if (className) {
    path.setAttribute("class", className);
  }

  if (dasharray) {
    path.setAttribute("stroke-dasharray", dasharray);
  }

  return path;
}

function createRect(
  x,
  y,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  className = "",
  radius = 0,
  opacity = 1,
) {
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("fill", fill);
  rect.setAttribute("stroke", stroke);
  rect.setAttribute("stroke-width", String(strokeWidth));
  rect.setAttribute("opacity", String(opacity));

  if (radius > 0) {
    rect.setAttribute("rx", String(radius));
  }

  if (className) {
    rect.setAttribute("class", className);
  }

  return rect;
}

function createText(x, y, text, anchor, fontSize, fill, className = "") {
  const element = document.createElementNS(SVG_NS, "text");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("text-anchor", anchor);
  element.setAttribute("font-size", String(fontSize));
  element.setAttribute("fill", fill);
  element.setAttribute(
    "font-family",
    '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
  );

  if (className) {
    element.setAttribute("class", className);
  }

  element.textContent = text;
  return element;
}

function createDiamond(x, y, radius, fill) {
  const diamond = document.createElementNS(SVG_NS, "path");
  diamond.setAttribute(
    "d",
    `M ${x} ${y - radius} L ${x + radius} ${y} L ${x} ${y + radius} L ${x - radius} ${y} Z`,
  );
  diamond.setAttribute("fill", fill);
  diamond.setAttribute("stroke", "rgba(255,255,255,0.86)");
  diamond.setAttribute("stroke-width", "3");
  return diamond;
}

function append(parent, child) {
  parent.appendChild(child);
}
