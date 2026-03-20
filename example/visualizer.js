import { HashRing, fnv1a } from "../packages/consistent-hash/dist/src/index.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_HASH = 0xffffffff;
const SAMPLE_KEY_COUNT = 512;
const REPLICA_COUNT = 3;
const DEFAULT_VIRTUAL_NODES = 24;
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
  selectedNodeId: null,
};

let transitionTimer = null;
let transitionAnimationTimer = null;

const sampleKeys = Array.from({ length: SAMPLE_KEY_COUNT }, (_, index) => `sample-key-${index}`);

const elements = {
  addNodeForm: document.querySelector("#add-node-form"),
  nodeId: document.querySelector("#node-id"),
  nodeWeight: document.querySelector("#node-weight"),
  probeKey: document.querySelector("#probe-key"),
  nodeList: document.querySelector("#node-list"),
  replicaList: document.querySelector("#replica-list"),
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
    ownerShift: "Virtual node positions are deterministic: hash(nodeId:vnodeIndex). Keys map to the first point clockwise.",
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

  const existingIndex = state.nodes.findIndex((node) => node.id === id);

  applyRingChange(
    {
      action: existingIndex >= 0 ? `Updated ${id}` : `Added ${id}`,
      kind: existingIndex >= 0 ? "update" : "add",
      focusNodeId: id,
    },
    () => {
      if (existingIndex >= 0) {
        const current = state.nodes[existingIndex];
        const updated = { ...current, weight };
        state.nodes.splice(existingIndex, 1, updated);
        state.ring.addNode(updated, weight);
        return `Updated ${id} to weight ${weight}, recalculating how many virtual nodes it contributes and which intervals it owns.`;
      }

      const node = buildNode(id, weight);
      state.nodes.push(node);
      state.ring.addNode(node, weight);
      state.nodeCounter += 1;
      return `Added ${id} with weight ${weight}, inserting new virtual-node points and remapping only the affected intervals.`;
    },
  );

  elements.addNodeForm.reset();
  elements.nodeWeight.value = "1";
  elements.nodeId.value = createSuggestedNodeId();
}

function handleAddRandomNode() {
  const id = createSuggestedNodeId();
  const weight = [0.75, 1, 1, 1.25, 1.5, 2][Math.floor(Math.random() * 6)];

  elements.nodeId.value = id;
  elements.nodeWeight.value = String(weight);

  applyRingChange(
    {
      action: `Added ${id}`,
      kind: "add",
      focusNodeId: id,
    },
    () => {
      const node = buildNode(id, weight);
      state.nodes.push(node);
      state.ring.addNode(node, weight);
      state.nodeCounter += 1;
      return `Added ${id} with weight ${weight}, inserting a fresh set of virtual-node points into the ring.`;
    },
  );

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

  applyRingChange(
    {
      action: `Removed ${nodeId}`,
      kind: "remove",
      focusNodeId: nodeId,
    },
    () => {
      state.nodes = state.nodes.filter((entry) => entry.id !== nodeId);
      state.ring.removeNode({ id: nodeId });
      return `Removed ${nodeId}; each interval owned by its virtual nodes moved to the next surviving owner clockwise.`;
    },
  );
}

function applyRingChange(change, mutate) {
  const beforeSnapshot = state.ring.snapshot();
  const beforeAssignments = captureAssignments();
  const beforeOwner = state.ring.getNode(state.key)?.id ?? null;
  const summary = mutate();

  if (change.kind === "remove") {
    if (state.selectedNodeId === change.focusNodeId) {
      state.selectedNodeId = null;
    }
  } else if (change.focusNodeId) {
    state.selectedNodeId = change.focusNodeId;
  }

  const afterSnapshot = state.ring.snapshot();
  const afterAssignments = captureAssignments();
  const afterOwner = state.ring.getNode(state.key)?.id ?? null;
  const diff = diffAssignments(beforeAssignments, afterAssignments);
  const transition = createTransition(beforeSnapshot, afterSnapshot, change);

  setTransition(transition);

  pushHistory({
    action: change.action,
    summary,
    movedRatio: diff.movedRatio,
    changedKeys: diff.changedKeys,
    ownerShift:
      beforeOwner && afterOwner && beforeOwner !== afterOwner
        ? `${state.key} now maps to ${afterOwner} instead of ${beforeOwner}.`
        : afterOwner
          ? `${state.key} maps to ${afterOwner}.`
          : "No owner available for the current key.",
  });

  render();
}

function toggleSelectedNode(nodeId) {
  state.selectedNodeId = state.selectedNodeId === nodeId ? null : nodeId;
  render();
}

function getNodeVisualState(nodeId, ownerId) {
  const isSelected = state.selectedNodeId === nodeId;
  const hasSelection = Boolean(state.selectedNodeId);
  const isOwner = ownerId === nodeId;

  return {
    isSelected,
    isOwner,
    isDimmed: hasSelection && !isSelected,
    isElevated: isSelected || (!hasSelection && isOwner),
  };
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
    statCard("Key owner", owner?.id ?? "none"),
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
      const isSelected = state.selectedNodeId === node.id;

      return `
        <article class="node-item selectable ${isSelected ? "selected" : ""}" data-select-node="${node.id}" role="button" tabindex="0" aria-pressed="${isSelected}">
          <div class="node-top">
            <div class="pill-row">
              <span class="swatch" style="background:${node.color}"></span>
              <span class="node-id">${node.id}</span>
              ${isSelected ? '<span class="pill pill-active">selected</span>' : ""}
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

  for (const card of elements.nodeList.querySelectorAll("[data-select-node]")) {
    card.addEventListener("click", () => toggleSelectedNode(card.getAttribute("data-select-node")));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSelectedNode(card.getAttribute("data-select-node"));
      }
    });
  }

  for (const button of elements.nodeList.querySelectorAll("[data-remove-node]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeNode(button.getAttribute("data-remove-node"));
    });
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
      const isSelected = state.selectedNodeId === node.id;

      return `
        <article class="replica-item ${isSelected ? "selected" : ""}">
          <div class="replica-top">
            <div class="pill-row">
              <span class="swatch" style="background:${color}"></span>
              <span class="replica-id">${node.id}</span>
            </div>
            <span class="pill">${index === 0 ? "primary owner" : `next node ${index}`}</span>
          </div>
        </article>
      `;
    })
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
      const isSelected = state.selectedNodeId === node.id;

      return `
        <article class="node-item selectable ${isSelected ? "selected" : ""}" data-select-node="${node.id}" role="button" tabindex="0" aria-pressed="${isSelected}">
          <div class="node-top">
            <div class="pill-row">
              <span class="swatch" style="background:${node.color}"></span>
              <strong>${node.id}</strong>
              ${isSelected ? '<span class="pill pill-active">selected</span>' : ""}
            </div>
              <span class="pill">${(share * 100).toFixed(1)}%</span>
            </div>
          <p class="subtle">Owns ${(share * 100).toFixed(1)}% of the hash space with weight ${node.weight} and ${vnodeCount} virtual nodes.</p>
        </article>
      `;
    })
    .join("");

  for (const card of elements.ownershipList.querySelectorAll("[data-select-node]")) {
    card.addEventListener("click", () => toggleSelectedNode(card.getAttribute("data-select-node")));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSelectedNode(card.getAttribute("data-select-node"));
      }
    });
  }
}

function renderBanner() {
  const latest = state.history[0];
  const transitionVerb =
    state.transition?.kind === "add"
      ? ` after points for ${state.transition.focusNodeId} were added`
      : state.transition?.kind === "remove"
        ? ` after points for ${state.transition.focusNodeId} were removed`
        : state.transition?.focusNodeId
          ? ` after ${state.transition.focusNodeId}'s weight changed`
          : "";
  const transitionCopy = state.transition
      ? `<p class="caption" style="margin-top:0.55rem;">${state.transition.changedIntervals.length} ownership intervals changed owner. The thin strip above the main bar shows who used to own those intervals${transitionVerb}.</p>`
      : "";
  const selectionCopy = state.selectedNodeId
    ? `<p class="caption" style="margin-top:0.55rem;">Selected node: <strong>${state.selectedNodeId}</strong>. Its slices and virtual-node points are emphasized across the ring and strip.</p>`
    : "";

  elements.changeBanner.innerHTML = latest
    ? `<strong>${latest.action}</strong><p>${latest.summary}</p><p class="caption" style="margin-top:0.55rem;">${latest.ownerShift}</p>${transitionCopy}${selectionCopy}`
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
      const percentage = (normalizedSpan(interval.start, interval.end) * 100).toFixed(2);
      return `
        <article class="change-chip">
          <strong>${interval.beforeOwner ?? "none"} -> ${interval.afterOwner ?? "none"}</strong>
          <p class="caption">${percentage}% of the hash space lies in this remapped interval.</p>
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
  const previousVnodeRadius = 308;
  const pointerRadius = 330;
  const owner = state.ring.getNode(state.key);
  const keyPosition = fnv1a(state.key) / MAX_HASH;
  const ownerId = owner?.id ?? null;
  const transition = state.transition;
  const isAnimatingTransition = Boolean(transition?.animate);

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

  if (transition) {
    renderRingSegments(svg, transition.beforeSnapshot, {
      center,
      radius: previousRadius,
      ownerId,
      baseStrokeWidth: 12,
      elevatedStrokeWidth: 15,
      selectedStrokeWidth: 20,
      baseOpacity: 0.18,
      elevatedOpacity: 0.28,
      selectedOpacity: 0.48,
      className: isAnimatingTransition ? "ring-before-ghost" : "",
    });
  }

  renderRingSegments(svg, snapshot, {
    center,
    radius: segmentRadius,
    ownerId,
    baseStrokeWidth: 20,
    elevatedStrokeWidth: 30,
    selectedStrokeWidth: 36,
    baseOpacity: 0.44,
    elevatedOpacity: 0.92,
    selectedOpacity: 1,
    className: isAnimatingTransition ? "ring-after-settle" : "",
  });

  if (transition) {
    for (const interval of transition.changedIntervals) {
      const intervalTouchesFocus =
        transition.focusNodeId &&
        (interval.beforeOwner === transition.focusNodeId ||
          interval.afterOwner === transition.focusNodeId);

      append(
        svg,
        createPath(
          describeArc(center, center, previousRadius, interval.start, interval.end),
          "none",
          colorForNode(interval.beforeOwner) ?? "rgba(27,36,48,0.35)",
          8,
          intervalTouchesFocus ? 0.72 : 0.5,
          isAnimatingTransition ? "interval-before" : "",
          "10 10",
        ),
      );
      append(
        svg,
        createPath(
          describeArc(center, center, highlightRadius, interval.start, interval.end),
          "none",
          colorForNode(interval.afterOwner) ?? "#d6a141",
          intervalTouchesFocus ? 10 : 6,
          intervalTouchesFocus ? 1 : 0.95,
          isAnimatingTransition
            ? `interval-after${intervalTouchesFocus ? " transition-focus-band" : ""}`
            : "",
        ),
      );
    }
  }

  if (transition?.exitingPoints.length) {
    for (const entry of transition.exitingPoints) {
      const point = pointOnCircle(center, center, previousVnodeRadius, entry.position);
      append(
        svg,
        createCircle(
          point.x,
          point.y,
          transition.focusNodeId === entry.nodeId ? 7 : 5.8,
          colorForNode(entry.nodeId) ?? "rgba(27,36,48,0.35)",
          "rgba(255,255,255,0.8)",
          2,
          isAnimatingTransition ? "transition-exiting-point" : "",
          0.6,
        ),
      );
    }
  }

  renderRingPoints(svg, snapshot.entries, {
    center,
    radius: vnodeRadius,
    ownerId,
  });

  if (transition?.enteringPoints.length) {
    for (const entry of transition.enteringPoints) {
      const point = pointOnCircle(center, center, vnodeRadius, entry.position);
      const isSelected = state.selectedNodeId === entry.nodeId;
      append(
        svg,
        createCircle(
          point.x,
          point.y,
          isSelected ? 10.2 : 8.4,
          colorForNode(entry.nodeId) ?? "#1d6b72",
          "rgba(255,255,255,0.88)",
          2,
          isAnimatingTransition ? "transition-entering-point" : "",
          0.96,
        ),
      );
    }
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
    const visuals = getNodeVisualState(node.id, ownerId);
    append(
      svg,
      createCircle(
        labelPoint.x,
        labelPoint.y,
        visuals.isSelected ? 14 : visuals.isElevated ? 11.5 : 10,
        node.color,
        "rgba(255,255,255,0.7)",
        visuals.isSelected ? 4 : 3,
        visuals.isSelected ? "selection-outline" : "",
      ),
    );
    append(
      svg,
      createText(
        labelPoint.x,
        labelPoint.y + 28,
        node.id,
        "middle",
        15,
        visuals.isSelected || node.id === ownerId ? "#1b2430" : "#5e655d",
        "",
        visuals.isSelected ? "700" : visuals.isElevated ? "600" : "400",
      ),
    );
  }

  append(
    svg,
    createText(
      center,
      58,
      state.transition
        ? "Color always maps to node identity. Dashed guides show the previous owner for remapped ranges."
        : "Color maps to node identity. Outer dots are virtual nodes; the inner band is current ownership.",
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
  const transition = state.transition;
  const isAnimatingTransition = Boolean(transition?.animate);

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

  forEachOwnershipSpan(snapshot, (current, startRatio, endRatio) => {
    const fill = colorForNode(current.nodeId) ?? "#1d6b72";
    const visuals = getNodeVisualState(current.nodeId, ownerId);

    appendWrappedRect(
      svg,
      startX,
      barY,
      width,
      barHeight,
      startRatio,
      endRatio,
      fill,
      visuals.isSelected ? 1 : visuals.isElevated ? 0.92 : visuals.isDimmed ? 0.26 : 0.56,
      "none",
      0,
      isAnimatingTransition ? "ring-after-settle" : "",
    );

    if (visuals.isSelected) {
      appendWrappedRect(
        svg,
        startX,
        barY - 5,
        width,
        barHeight + 10,
        startRatio,
        endRatio,
        "rgba(0,0,0,0)",
        1,
        fill,
        3,
        "selection-outline",
      );
    }
  });

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

  if (transition) {
    append(
      svg,
      createText(
        startX,
        ghostY - 8,
        transition.focusNodeId
          ? `Previous owners where ${transition.focusNodeId} changed the map`
          : "Previous owners of remapped intervals",
        "start",
        12,
        "#5e655d",
      ),
    );

    for (const interval of transition.changedIntervals) {
      const intervalTouchesFocus =
        transition.focusNodeId &&
        (interval.beforeOwner === transition.focusNodeId ||
          interval.afterOwner === transition.focusNodeId);

      appendWrappedRect(
        svg,
        startX,
        ghostY,
        width,
        ghostHeight,
        interval.start,
        interval.end,
        colorForNode(interval.beforeOwner) ?? "rgba(27,36,48,0.25)",
        intervalTouchesFocus ? 0.8 : 0.6,
        "rgba(27,36,48,0.06)",
        1,
        isAnimatingTransition ? "interval-before" : "",
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
        intervalTouchesFocus ? 4 : 3,
        isAnimatingTransition
          ? `interval-after${intervalTouchesFocus ? " transition-focus-band" : ""}`
          : "",
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
    const visuals = getNodeVisualState(node.id, ownerId);
    append(
      svg,
      createCircle(
        legendX,
        182,
        visuals.isSelected ? 8.6 : visuals.isElevated ? 7 : 6,
        node.color,
        visuals.isSelected ? "rgba(27,36,48,0.18)" : "none",
        visuals.isSelected ? 2 : 0,
        visuals.isSelected ? "selection-outline" : "",
      ),
    );
    append(
      svg,
      createText(
        legendX + 12,
        187,
        `${node.id} ${(share * 100).toFixed(1)}%`,
        "start",
        14,
        visuals.isSelected || node.id === ownerId ? "#1b2430" : "#5e655d",
        "",
        visuals.isSelected ? "700" : visuals.isElevated ? "600" : "400",
      ),
    );
    legendX += 160;
  }
}

function renderRingSegments(svg, snapshot, options) {
  const {
    center,
    radius,
    ownerId,
    baseStrokeWidth,
    elevatedStrokeWidth,
    selectedStrokeWidth,
    baseOpacity,
    elevatedOpacity,
    selectedOpacity,
    className = "",
  } = options;

  forEachOwnershipSpan(snapshot, (current, start, end) => {
    const visuals = getNodeVisualState(current.nodeId, ownerId);
    append(
      svg,
      createPath(
        describeArc(center, center, radius, start, end),
        "none",
        colorForNode(current.nodeId) ?? "#1d6b72",
        visuals.isSelected
          ? selectedStrokeWidth
          : visuals.isElevated
            ? elevatedStrokeWidth
            : baseStrokeWidth,
        visuals.isSelected
          ? selectedOpacity
          : visuals.isElevated
            ? elevatedOpacity
            : visuals.isDimmed
              ? baseOpacity * 0.55
              : baseOpacity,
        className,
      ),
    );
  });
}

function renderRingPoints(svg, entries, options) {
  const { center, radius, ownerId } = options;

  for (const entry of entries) {
    const visuals = getNodeVisualState(entry.nodeId, ownerId);
    const point = pointOnCircle(center, center, radius, entry.position / MAX_HASH);

    append(
      svg,
      createCircle(
        point.x,
        point.y,
        visuals.isSelected ? 8.2 : visuals.isElevated ? 6.6 : 5.6,
        colorForNode(entry.nodeId) ?? "#1d6b72",
        "rgba(255,255,255,0.8)",
        visuals.isSelected ? 3 : 2,
        "",
        visuals.isSelected ? 1 : visuals.isDimmed ? 0.36 : 0.92,
      ),
    );
  }
}

function forEachOwnershipSpan(snapshot, callback) {
  for (let index = 0; index < snapshot.entries.length; index += 1) {
    const current = snapshot.entries[index];
    const previous =
      snapshot.entries[(index - 1 + snapshot.entries.length) % snapshot.entries.length];
    callback(current, previous.position / MAX_HASH, current.position / MAX_HASH);
  }
}

function setTransition(transition) {
  const transitionId = Symbol("transition");
  state.transition = {
    ...transition,
    animate: true,
    id: transitionId,
  };

  if (transitionTimer) {
    clearTimeout(transitionTimer);
  }

  if (transitionAnimationTimer) {
    clearTimeout(transitionAnimationTimer);
  }

  transitionAnimationTimer = setTimeout(() => {
    if (state.transition?.id !== transitionId) {
      return;
    }

    state.transition = {
      ...state.transition,
      animate: false,
    };
    render();
  }, 1600);

  transitionTimer = setTimeout(() => {
    if (state.transition?.id === transitionId) {
      state.transition = null;
      render();
    }
  }, 4800);
}

function createTransition(beforeSnapshot, afterSnapshot, meta = {}) {
  const boundaries = new Set([0, 1]);
  const beforeEntryKeys = new Set(beforeSnapshot.entries.map(entryKey));
  const afterEntryKeys = new Set(afterSnapshot.entries.map(entryKey));
  const focusNodeId = meta.focusNodeId ?? null;

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
    kind: meta.kind ?? "update",
    focusNodeId,
    beforeSnapshot,
    afterSnapshot,
    changedIntervals,
    enteringPoints: afterSnapshot.entries
      .filter(
        (entry) =>
          !beforeEntryKeys.has(entryKey(entry)) && (!focusNodeId || entry.nodeId === focusNodeId),
      )
      .map((entry) => ({
        nodeId: entry.nodeId,
        position: entry.position / MAX_HASH,
      })),
    exitingPoints: beforeSnapshot.entries
      .filter(
        (entry) =>
          !afterEntryKeys.has(entryKey(entry)) && (!focusNodeId || entry.nodeId === focusNodeId),
      )
      .map((entry) => ({
        nodeId: entry.nodeId,
        position: entry.position / MAX_HASH,
      })),
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

function entryKey(entry) {
  return `${entry.nodeId}:${entry.position}`;
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

function createCircle(cx, cy, radius, fill, stroke, strokeWidth = 0, className = "", opacity = 1) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(radius));
  circle.setAttribute("fill", fill);
  circle.setAttribute("stroke", stroke);
  circle.setAttribute("stroke-width", String(strokeWidth));
  circle.setAttribute("opacity", String(opacity));

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

function createText(x, y, text, anchor, fontSize, fill, className = "", fontWeight = "400") {
  const element = document.createElementNS(SVG_NS, "text");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("text-anchor", anchor);
  element.setAttribute("font-size", String(fontSize));
  element.setAttribute("fill", fill);
  element.setAttribute("font-weight", fontWeight);
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
