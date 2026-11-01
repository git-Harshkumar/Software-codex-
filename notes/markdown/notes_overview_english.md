# Lecture Overview: Level 2 NCEA Networks - Shortest Path (Dijkstra’s Algorithm)

## Main Idea & Visual Model

> **Core Intuition**: Imagine dropping a stone into a still pond at the source node. Ripples spread outward across all paths at rates inversely proportional to edge weights (distances). The exact moment a ripple first touches any target node represents the absolute shortest path to that location. Dijkstra's algorithm systematically records these ripple arrival times through iterative edge relaxation and permanent node labeling.

<svg width="100%" height="240" viewBox="0 0 650 240" xmlns="http://www.w3.org/2000/svg">
  <!-- Background Card -->
  <rect width="650" height="240" rx="12" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
  
  <!-- Title Label -->
  <text x="25" y="32" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#38bdf8" letter-spacing="0.5">DIJKSTRA'S SHORTEST PATH NETWORK MODEL</text>
  
  <!-- Edges -->
  <line x1="100" y1="120" x2="260" y2="70" stroke="#475569" stroke-width="3"/>
  <text x="170" y="83" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#fbbf24">w = 4</text>
  
  <line x1="100" y1="120" x2="260" y2="170" stroke="#34d399" stroke-width="3.5"/>
  <text x="170" y="160" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#34d399">w = 2 (Selected)</text>
  
  <line x1="260" y1="70" x2="430" y2="120" stroke="#475569" stroke-width="3"/>
  <text x="350" y="85" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#fbbf24">w = 5</text>
  
  <line x1="260" y1="170" x2="430" y2="120" stroke="#34d399" stroke-width="3.5"/>
  <text x="350" y="160" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#34d399">w = 3 (Selected)</text>

  <line x1="430" y1="120" x2="570" y2="120" stroke="#38bdf8" stroke-width="3.5"/>
  <text x="490" y="110" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="#38bdf8">w = 1</text>
  
  <!-- Node A (Source) -->
  <circle cx="100" cy="120" r="28" fill="#1e293b" stroke="#38bdf8" stroke-width="3"/>
  <text x="100" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">A</text>
  <text x="100" y="132" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#38bdf8" text-anchor="middle">Dist: 0</text>
  
  <!-- Node B -->
  <circle cx="260" cy="70" r="28" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
  <text x="260" y="65" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">B</text>
  <text x="260" y="82" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#94a3b8" text-anchor="middle">Dist: 4</text>

  <!-- Node C -->
  <circle cx="260" cy="170" r="28" fill="#1e293b" stroke="#34d399" stroke-width="3"/>
  <text x="260" y="165" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">C</text>
  <text x="260" y="182" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#34d399" text-anchor="middle">Dist: 2</text>
  
  <!-- Node D -->
  <circle cx="430" cy="120" r="28" fill="#1e293b" stroke="#34d399" stroke-width="3"/>
  <text x="430" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">D</text>
  <text x="430" y="132" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#34d399" text-anchor="middle">Dist: 5</text>

  <!-- Node E (Destination) -->
  <circle cx="570" cy="120" r="28" fill="#1e293b" stroke="#a78bfa" stroke-width="3"/>
  <text x="570" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#f8fafc" text-anchor="middle">E</text>
  <text x="570" y="132" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#a78bfa" text-anchor="middle">Total: 6</text>

  <!-- Legend Box -->
  <rect x="25" y="195" width="220" height="30" rx="6" fill="#1e293b" stroke="#334155"/>
  <text x="35" y="214" font-family="system-ui, sans-serif" font-size="11" fill="#34d399" font-weight="600">Shortest Path: A → C → D → E</text>
</svg>

---

## Key Concepts & Mechanism Flow (with Timestamps)

```ascii
[ Traversal Basics ] ──> [ Distance Initialization ] ──> [ Edge Relaxation ] ──> [ Permanent Labeling ]
 (BFS / DFS Context)         (Start = 0, Rest = ∞)        (Update Tentative)       (Final Minimum Path)
```

* **[00:09 - 00:13] Graph Traversal Foundation**
  * Graph traversal methods search through complex networks by systematically visiting connected nodes.
  * *Unweighted* traversal strategies include **Breadth-First Search (BFS)** and **Depth-First Search (DFS)**.
  * *Weighted* graph optimization requires specialized shortest-path algorithms such as **Dijkstra's Algorithm**.

* **[00:14 - 00:20] Comparative Traversal Analysis**
  * BFS explores nodes uniformly level-by-level (ideal for unweighted shortest paths).
  * DFS explores deeply along single branches before backtracking (used for topological sorting and component detection).
  * Dijkstra's algorithm incorporates edge weights to guarantee absolute minimum cost pathways.

* **[00:21 - 00:28] Algorithmic Execution Steps**
  1. Assign a initial tentative distance of zero to the starting vertex and infinity (∞) to all remaining vertices.
  2. Mark all vertices as unvisited and create an active unvisited set.
  3. Calculate tentative distances to unvisited neighbors from the current node:
     $$\text{Tentative Distance} = \text{Current Node Distance} + \text{Edge Weight}$$
  4. Compare the newly calculated tentative distance with the recorded distance; retain the smaller value.
  5. Select the unvisited vertex with the smallest tentative distance, mark it as permanently visited, and repeat.

<svg width="100%" height="220" viewBox="0 0 650 220" xmlns="http://www.w3.org/2000/svg">
  <rect width="650" height="220" rx="12" fill="#0f172a" stroke="#1e293b" stroke-width="2"/>
  <text x="25" y="30" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#38bdf8">DIJKSTRA PROCESS PIPELINE</text>

  <!-- Step 1 -->
  <rect x="25" y="60" width="105" height="120" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="77" y="85" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#38bdf8" text-anchor="middle">Step 1</text>
  <text x="77" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#f8fafc" text-anchor="middle">Set Start = 0</text>
  <text x="77" y="135" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">Others = ∞</text>

  <!-- Arrow 1 -->
  <path d="M 135 120 L 150 120" stroke="#64748b" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- Step 2 -->
  <rect x="155" y="60" width="105" height="120" rx="8" fill="#1e293b" stroke="#fbbf24" stroke-width="1.5"/>
  <text x="207" y="85" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#fbbf24" text-anchor="middle">Step 2</text>
  <text x="207" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#f8fafc" text-anchor="middle">Select Min</text>
  <text x="207" y="135" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">Unvisited Node</text>

  <!-- Arrow 2 -->
  <path d="M 265 120 L 280 120" stroke="#64748b" stroke-width="2"/>

  <!-- Step 3 -->
  <rect x="285" y="60" width="105" height="120" rx="8" fill="#1e293b" stroke="#34d399" stroke-width="1.5"/>
  <text x="337" y="85" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#34d399" text-anchor="middle">Step 3</text>
  <text x="337" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#f8fafc" text-anchor="middle">Relax Edges</text>
  <text x="337" y="135" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">Dist[u] + w &lt; Dist[v]</text>

  <!-- Arrow 3 -->
  <path d="M 395 120 L 410 120" stroke="#64748b" stroke-width="2"/>

  <!-- Step 4 -->
  <rect x="415" y="60" width="105" height="120" rx="8" fill="#1e293b" stroke="#a78bfa" stroke-width="1.5"/>
  <text x="467" y="85" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#a78bfa" text-anchor="middle">Step 4</text>
  <text x="467" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#f8fafc" text-anchor="middle">Mark Node</text>
  <text x="467" y="135" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">As Permanent</text>

  <!-- Arrow 4 -->
  <path d="M 525 120 L 540 120" stroke="#64748b" stroke-width="2"/>

  <!-- Step 5 -->
  <rect x="545" y="60" width="80" height="120" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
  <text x="585" y="85" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#38bdf8" text-anchor="middle">Done</text>
  <text x="585" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#f8fafc" text-anchor="middle">Target</text>
  <text x="585" y="135" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">Reached</text>
</svg>

---

## Core Formulation / Mechanism Snapshot

### Edge Relaxation Equation
For a directed edge from node **u** to node **v** with weight **w**:

$$\text{Distance}[v] = \min(\text{Distance}[v], \, \text{Distance}[u] + w(u, v))$$

> **Key Rule**: If $\text{Distance}[u] + w(u, v) < \text{Distance}[v]$, update $\text{Distance}[v]$ with the new shorter distance.

### Python Reference Implementation

```python
import heapq

def dijkstra(graph, start_node):
    # Initialize all node distances to infinity
    distances = {node: float('inf') for node in graph}
    distances[start_node] = 0
    
    # Priority queue stores tuples of (distance, node)
    priority_queue = [(0, start_node)]
    
    while priority_queue:
        current_distance, current_node = heapq.heappop(priority_queue)
        
        # Skip processing if a shorter path to current_node was already recorded
        if current_distance > distances[current_node]:
            continue
            
        # Relax edges to adjacent nodes
        for neighbor, weight in graph[current_node].items():
            distance = current_distance + weight
            
            # Update distance if a shorter path is found
            if distance < distances[neighbor]:
                distances[neighbor] = distance
                heapq.heappush(priority_queue, (distance, neighbor))
                
    return distances

# Example Network Graph Initialization
network_graph = {
    'A': {'B': 4, 'C': 2},
    'B': {'D': 5},
    'C': {'D': 3},
    'D': {'E': 1},
    'E': {}
}

# Calculated Shortest Path Distances from Node 'A'
# Output: {'A': 0, 'B': 4, 'C': 2, 'D': 5, 'E': 6}
print(dijkstra(network_graph, 'A'))
```

* **Time Complexity**: $\mathcal{O}((V + E) \log V)$ using a binary min-heap implementation.
* **Space Complexity**: $\mathcal{O}(V)$ to store node labels, priority queue contents, and shortest path values.

---

## Takeaway

> **Summary**: Dijkstra's algorithm determines the guaranteed shortest path from a source node to all other vertices in a non-negative weighted network. By maintaining permanent working values and relaxing adjacent node distances iteratively, it prevents redundant evaluations and computes optimal routes efficiently.

---

## Quick Revision

1. **Category**: Greedy algorithm used for finding single-source shortest paths in weighted graphs.
2. **Initial Conditions**: Source node distance is initialized to 0; all other nodes are initialized to ∞.
3. **Core Operation (Relaxation)**: Updates neighbor distances whenever `Dist[u] + Weight(u, v) < Dist[v]`.
4. **Constraint**: Requires non-negative edge weights ($w \ge 0$). Fails when graphs contain negative edge weights.
5. **Comparison**:
   * **BFS**: Computes shortest path on *unweighted* graphs in $\mathcal{O}(V + E)$.
   * **DFS**: Deep traversal method, not designed for shortest paths.
   * **Dijkstra**: Computes shortest path on *weighted* graphs in $\mathcal{O}((V + E) \log V)$.
6. **Permanent Mark**: Once an unvisited node with the smallest tentative distance is chosen, its minimum shortest path is permanently fixed.
7. **NCEA Exam Tip**: Always write down working values at each step alongside the final permanent node labels.