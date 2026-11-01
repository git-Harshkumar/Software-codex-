# Detailed Lecture Notes: Level 2 NCEA Networks - Shortest Path (Dijkstra’s Algorithm)

---

## 1. Introduction & Learning Goals [00:00]

Network analysis is a core branch of discrete mathematics and operations research evaluated in NCEA Level 2 Mathematics. The primary objective of the **Shortest Path Problem** is to determine the path between two specified vertices (or nodes) in a weighted network such that the sum of the weights of its constituent edges is minimized.

```
       [ Start Node: A ] ───( Weight: 4 )───> [ Node B ]
               │                                   │
          ( Weight: 2 )                       ( Weight: 1 )
               ▼                                   ▼
          [ Node C ] ───( Weight: 3 )───> [ Destination: D ]
```

### Key Learning Objectives
* Master the foundational terminology of network graphs: vertices, edges, weights, paths, and directed/undirected graphs.
* Understand the conceptual framework of **Dijkstra's Algorithm**, including the distinction between **temporary labels** and **permanent labels**.
* Perform step-by-step manual calculations using standard NCEA box and tabular notation.
* Trace optimal routes backwards from the destination node to the starting node (Backtracking).
* Analyze algorithmic efficiency, time/space complexity, and failure conditions such as negative edge weights.

---

## 2. Graph Foundations & Terminology in Network Analysis [01:15]

### Concept Overview & Deep Intuition

Before applying optimization algorithms, a network must be formally modeled using graph theory. A network consists of discrete points connected by lines. Weights assigned to these lines represent metrics such as physical distance, travel time, monetary cost, or energy consumption.

> **Core Intuition & Mental Model**: Think of a network as an interconnected system of roads linking cities. Vertices are city intersections, while edges are the roads connecting them. Edge weights represent travel time in minutes. Finding the shortest path is equivalent to finding the fastest driving route between two cities under static traffic conditions.

### Concept Visualization

The following vector visual illustrates a weighted, undirected graph G = (V, E) with 6 vertices and 8 weighted edges.

<svg width="100%" height="260" viewBox="0 0 650 260" xmlns="http://www.w3.org/2000/svg">
  <rect width="650" height="260" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <text x="325" y="25" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">Weighted Network Graph G = (V, E)</text>
  
  <!-- Connections / Edges -->
  <line x1="80" y1="130" x2="200" y2="70" stroke="#64748b" stroke-width="2"/>
  <line x1="80" y1="130" x2="200" y2="190" stroke="#64748b" stroke-width="2"/>
  <line x1="200" y1="70" x2="360" y2="70" stroke="#64748b" stroke-width="2"/>
  <line x1="200" y1="70" x2="200" y2="190" stroke="#64748b" stroke-width="2"/>
  <line x1="200" y1="190" x2="360" y2="190" stroke="#64748b" stroke-width="2"/>
  <line x1="360" y1="70" x2="360" y2="190" stroke="#64748b" stroke-width="2"/>
  <line x1="360" y1="70" x2="520" y2="130" stroke="#64748b" stroke-width="2"/>
  <line x1="360" y1="190" x2="520" y2="130" stroke="#64748b" stroke-width="2"/>
  
  <!-- Edge Weights Background Badges -->
  <rect x="130" y="85" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="142" y="98" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">4</text>
  
  <rect x="130" y="165" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="142" y="178" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">2</text>
  
  <rect x="270" y="52" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="282" y="65" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">5</text>
  
  <rect x="188" y="122" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="200" y="135" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">1</text>
  
  <rect x="270" y="198" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="282" y="211" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">8</text>
  
  <rect x="348" y="122" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="360" y="135" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">3</text>
  
  <rect x="430" y="85" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="442" y="98" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">6</text>
  
  <rect x="430" y="165" width="24" height="18" rx="4" fill="#1e293b"/>
  <text x="442" y="178" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#fbbf24" text-anchor="middle">2</text>
  
  <!-- Vertices -->
  <!-- A (Start) -->
  <circle cx="80" cy="130" r="22" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
  <text x="80" y="135" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">A</text>
  
  <!-- B -->
  <circle cx="200" cy="70" r="20" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
  <text x="200" y="75" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#f8fafc" text-anchor="middle">B</text>
  
  <!-- C -->
  <circle cx="200" cy="190" r="20" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
  <text x="200" y="195" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#f8fafc" text-anchor="middle">C</text>
  
  <!-- D -->
  <circle cx="360" cy="70" r="20" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
  <text x="360" y="75" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#f8fafc" text-anchor="middle">D</text>
  
  <!-- E -->
  <circle cx="360" cy="190" r="20" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
  <text x="360" y="195" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#f8fafc" text-anchor="middle">E</text>
  
  <!-- F (Destination) -->
  <circle cx="520" cy="130" r="22" fill="#059669" stroke="#34d399" stroke-width="2"/>
  <text x="520" y="135" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">F</text>
</svg>

### Formal Definitions & Equations

* **Graph Representation**: A network graph G is defined as an ordered pair G = (V, E), where:
  * V = { v₁, v₂, ..., vₙ } is the set of **Vertices** (nodes).
  * E = { e₁, e₂, ..., eₘ } is the set of **Edges** (arcs), where each edge e = (u, v) connects vertex u to vertex v.
* **Edge Weight Mapping**: A function w: E → ℝ⁺ assigning a non-negative real number weight to each edge e.
* **Path Definition**: A path P from source vertex vₛ to target vertex vₜ is an sequence of vertices P = (v₀, v₁, v₂, ..., vₖ) such that v₀ = vₛ, vₖ = vₜ, and (vᵢ₋₁, vᵢ) ∈ E for all 1 ≤ i ≤ k.
* **Total Path Weight**:
  
  $$L(P) = \sum_{i=1}^{k} w(v_{i-1}, v_i)$$

* **Shortest Path Objective**: Find path P* such that:
  
  $$L(P^*) = \min_{P} L(P)$$

---

## 3. Core Principles of Dijkstra’s Algorithm [04:30]

### Concept Overview & Deep Intuition

Dijkstra's Algorithm (developed by Edsger W. Dijkstra in 1956) solves the single-source shortest path problem for a graph with non-negative edge weights. It is a **greedy algorithm**: at each step, it chooses the unvisited vertex with the smallest tentative distance, converts its label to permanent, and relaxes all of its adjacent neighbors.

> **Core Intuition & Mental Model**: Imagine turning on a water faucet at the starting node. Water flows outward along all connected pipes at a uniform speed (1 unit of distance per second). The order in which water reaches each vertex corresponds to the exact chronological order in which Dijkstra's algorithm marks nodes as **permanent**. The first time water reaches a vertex, it has arrived via the absolute shortest path possible.

### Concept Visualization: Wavefront Expansion Mechanics

<svg width="100%" height="240" viewBox="0 0 650 240" xmlns="http://www.w3.org/2000/svg">
  <rect width="650" height="240" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <text x="325" y="25" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">Dijkstra Node State Transition Workflow</text>
  
  <!-- State 1: Unvisited -->
  <g transform="translate(50, 60)">
    <rect width="150" height="140" rx="8" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
    <circle cx="75" cy="50" r="22" fill="#334155" stroke="#64748b" stroke-width="2"/>
    <text x="75" y="55" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#94a3b8" text-anchor="middle">v</text>
    <text x="75" y="95" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#cbd5e1" text-anchor="middle">Unvisited</text>
    <text x="75" y="118" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Label = (∞, None)</text>
  </g>

  <!-- Arrow 1 -->
  <path d="M 210 130 L 240 130" stroke="#38bdf8" stroke-width="2" marker-end="url(#arrow)"/>
  
  <!-- State 2: Tentative / Temporary -->
  <g transform="translate(250, 60)">
    <rect width="150" height="140" rx="8" fill="#1e293b" stroke="#0284c7" stroke-width="1.5"/>
    <circle cx="75" cy="50" r="22" fill="#0369a1" stroke="#38bdf8" stroke-width="2"/>
    <text x="75" y="55" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">v</text>
    <text x="75" y="95" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#38bdf8" text-anchor="middle">Temporary</text>
    <text x="75" y="118" font-family="system-ui, sans-serif" font-size="11" fill="#93c5fd" text-anchor="middle">Label = (d(v), u)</text>
  </g>

  <!-- Arrow 2 -->
  <path d="M 410 130 L 440 130" stroke="#34d399" stroke-width="2"/>
  
  <!-- State 3: Permanent -->
  <g transform="translate(450, 60)">
    <rect width="150" height="140" rx="8" fill="#1e293b" stroke="#059669" stroke-width="1.5"/>
    <circle cx="75" cy="50" r="22" fill="#047857" stroke="#34d399" stroke-width="2"/>
    <text x="75" y="55" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">v</text>
    <text x="75" y="95" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#34d399" text-anchor="middle">Permanent</text>
    <text x="75" y="118" font-family="system-ui, sans-serif" font-size="11" fill="#a7f3d0" text-anchor="middle">Final Shortest Distance</text>
  </g>
</svg>

### Key Properties & Mathematical Definitions

1. **Distance Function d(v)**: Stores the current shortest known distance from start vertex S to vertex v.
2. **Predecessor Pointer p(v)**: Tracks the vertex immediately preceding v on the shortest path.
3. **Edge Relaxation Equation**:
   For an active edge (u, v) with weight w(u, v), if:
   
   $$d(u) + w(u, v) < d(v)$$
   
   Then update:
   
   $$d(v) = d(u) + w(u, v) \quad \text{and} \quad p(v) = u$$

4. **Greedy Choice Property**: At any iteration, the unvisited node u with the smallest temporary label d(u) is guaranteed to have its shortest possible path established. Thus, d(u) becomes permanent.

---

## 4. Step-by-Step Manual Algorithm (NCEA Method) [08:45]

In NCEA Level 2 examination papers, students are expected to use a systematic node-labeling box format or working table.

### The NCEA Standard Node Label Format

Each node in the network diagram is annotated with a multi-part label box:

```
┌───────────────────────────────────────────┐
│ [ Order of Visit ]  |  [ Final Distance ] │
├───────────────────────────────────────────┤
│ [ Temporary Label Working Space / Predecessor ] │
└───────────────────────────────────────────┘
```

### Algorithmic Sequence

```
[ Step 1: Initialize ]
  ├── d(Start) = 0, Order(Start) = 1
  └── d(v) = ∞ for all v ≠ Start

[ Step 2: Select Current Node ]
  └── Find unvisited vertex u with min temporary distance d(u)
  └── Mark u as PERMANENT. Assign Order of Visit.

[ Step 3: Edge Relaxation ]
  └── For each unvisited neighbor v of u:
        If d(u) + w(u,v) < d(v):
           d(v) = d(u) + w(u,v)
           Record u as predecessor of v

[ Step 4: Repeat ]
  └── Repeat Steps 2 & 3 until Target Destination is permanent (or all nodes visited)

[ Step 5: Path Backtracking ]
  └── Trace predecessor pointers from Destination back to Start
```

---

## 5. Worked Example: Complete Network Solution Walkthrough [14:20]

### Problem Statement
Find the shortest path and minimum total travel distance from **Node A** to **Node F** in the following network:

```
        (B)───[5]───(D)
       / │           │ \
     [4] [1]        [3] [6]
     /   │           │   \
   (A)   └───(C)     └───(F)
     \       /       /
     [2]   [8]     [2]
       \   /       /
        (E)───────┘
```

#### Network Edge List & Weights
* Edge (A, B) = 4
* Edge (A, E) = 2
* Edge (B, C) = 1
* Edge (B, D) = 5
* Edge (E, C) = 8
* Edge (E, F) = 2
* Edge (D, F) = 6
* Edge (C, D) = 3

---

### Step-by-Step Execution Table

| Step | Active Node | Permanent Dist | Unvisited Set (V \ S) | Temporary Distance Updates | Selected Min Node |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | - | - | {A, B, C, D, E, F} | d(A)=0, d(B)=∞, d(C)=∞, d(D)=∞, d(E)=∞, d(F)=∞ | **A** (0) |
| **1** | **A** | d(A) = 0 | {B, C, D, E, F} | d(B) = min(∞, 0+4) = **4** [via A]<br>d(E) = min(∞, 0+2) = **2** [via A] | **E** (2) |
| **2** | **E** | d(E) = 2 | {B, C, D, F} | d(C) = min(∞, 2+8) = 10 [via E]<br>d(F) = min(∞, 2+2) = **4** [via E] | **B** (4) or **F** (4) → Select **B** |
| **3** | **B** | d(B) = 4 | {C, D, F} | d(C) = min(10, 4+1) = **5** [via B]<br>d(D) = min(∞, 4+5) = **9** [via B] | **F** (4) |
| **4** | **F** | d(F) = 4 | {C, D} | Destination F reaches permanent status with distance 4! | **Target Met** |

*Note*: For absolute completeness, let's observe node C and node D to confirm no smaller path reaches F.
* Step 4 checks F: d(F) is already 4.
* Let's check node C: d(C) = 5. Neighbor D: d(D) = min(9, 5+3) = 8 [via C].
* Edge from D to F would yield 8 + 6 = 14 > 4. Thus distance 4 remains minimal.

---

### Visualization of Final Permanent State

<svg width="100%" height="260" viewBox="0 0 650 260" xmlns="http://www.w3.org/2000/svg">
  <rect width="650" height="260" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <text x="325" y="25" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">Shortest Path Solution Vector (A → E → F)</text>
  
  <!-- Active Path Highlight Lines (Green/Cyan) -->
  <line x1="100" y1="130" x2="220" y2="200" stroke="#34d399" stroke-width="4"/>
  <line x1="220" y1="200" x2="520" y2="130" stroke="#34d399" stroke-width="4"/>
  
  <!-- Inactive Network Lines (Gray) -->
  <line x1="100" y1="130" x2="220" y2="60" stroke="#334155" stroke-width="1.5" stroke-dasharray="4"/>
  <line x1="220" y1="60" x2="370" y2="60" stroke="#334155" stroke-width="1.5" stroke-dasharray="4"/>
  <line x1="220" y1="60" x2="370" y2="140" stroke="#334155" stroke-width="1.5" stroke-dasharray="4"/>
  <line x1="220" y1="200" x2="370" y2="140" stroke="#334155" stroke-width="1.5" stroke-dasharray="4"/>
  <line x1="370" y1="60" x2="520" y2="130" stroke="#334155" stroke-width="1.5" stroke-dasharray="4"/>
  <line x1="370" y1="140" x2="370" y2="60" stroke="#334155" stroke-width="1.5" stroke-dasharray="4"/>
  
  <!-- Node A (Start) -->
  <g transform="translate(100, 130)">
    <circle cx="0" cy="0" r="22" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
    <text x="0" y="5" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">A</text>
    <rect x="-25" y="-45" width="50" height="18" rx="4" fill="#0369a1"/>
    <text x="0" y="-32" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#f8fafc" text-anchor="middle">[1] d=0</text>
  </g>

  <!-- Node E -->
  <g transform="translate(220, 200)">
    <circle cx="0" cy="0" r="22" fill="#047857" stroke="#34d399" stroke-width="2"/>
    <text x="0" y="5" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">E</text>
    <rect x="-25" y="25" width="50" height="18" rx="4" fill="#065f46"/>
    <text x="0" y="38" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#a7f3d0" text-anchor="middle">[2] d=2</text>
  </g>

  <!-- Node F (Target) -->
  <g transform="translate(520, 130)">
    <circle cx="0" cy="0" r="24" fill="#059669" stroke="#34d399" stroke-width="3"/>
    <text x="0" y="5" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle">F</text>
    <rect x="-30" y="-48" width="60" height="20" rx="4" fill="#065f46"/>
    <text x="0" y="-34" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#34d399" text-anchor="middle">[3] d=4 (★)</text>
  </g>
  
  <!-- Other Nodes -->
  <!-- B -->
  <circle cx="220" cy="60" r="18" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/>
  <text x="220" y="64" font-family="system-ui, sans-