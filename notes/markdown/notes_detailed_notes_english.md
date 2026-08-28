# Detailed Lecture Notes

## 1. Introduction to Graph Search

Graph Search is the foundational algorithmic technique for exploring graphs. Given a graph $G = (V, E)$, graph search algorithms systematically traverse the structure to answer key computational questions:

*   **Path Finding:** Given a starting vertex $s$ and a target vertex $t$, determine if a path exists from $s$ to $t$, and compute the optimal sequence of edges connecting them.
*   **Reachable Nodes Exploration:** Given a single source vertex $s$, find every vertex in the graph that can be reached by following valid edges from $s$.
*   **Complete Graph Exploration:** Visit every vertex and edge in the graph systematically (e.g., to detect connected components or cycles).

---

## 2. Graph Fundamentals & Representations

### Graph Definition
A graph $G = (V, E)$ consists of:
1.  **Vertices ($V$):** A set of nodes or entities.
2.  **Edges ($E$):** A set of connections between pairs of vertices.
    *   **Undirected Graph:** Edges are **unordered pairs** $\{u, v\}$. Movement is bidirectional (e.g., friendship connections, reversible physical transitions).
    *   **Directed Graph (Digraph):** Edges are **ordered pairs** $(u, v)$ pointing from $u$ to $v$. Movement is unidirectional (e.g., hyperlinks, one-way streets).

```
[Undirected Graph Example — as drawn on board in MIT 6.006 Lecture 13]
   a — b
   |\ /
   | X
   |/ \
   c — d

Vertices (V): {a, b, c, d}
Edges (E):    {{a,b}, {a,c}, {b,c}, {c,d}}

[Directed Graph Example — as drawn on board in MIT 6.006 Lecture 13]
   b ——> a
   ↓       ↘
   c ↔ (b and c point to each other)

Vertices (V): {a, b, c}
Edges (E):    {(a,c), (b,a), (b,c), (c,b)}
```

---

### In-Memory Graph Representations

The efficiency of any graph search algorithm depends directly on how the graph is represented in memory.

#### 1. Edge List (Naive Representation)
*   **Structure:** An array of vertex identifiers and a separate array of edge pairs $[(u_1, v_1), (u_2, v_2), \dots]$.
*   **Flaw:** Finding the neighbors of vertex $u$ requires scanning the entire edge list, costing $O(E)$ time per vertex. This makes graph exploration unacceptably slow ($O(V \cdot E)$).

#### 2. Adjacency List (Standard Explicit Representation)
*   **Structure:** An array or hash table `adj` of size $|V|$. For each vertex $u$, `adj[u]` stores an array or linked list containing all neighbors $v$ such that $(u, v) \in E$.
*   **Space Complexity:** $\Theta(V + E)$
    *   $|V|$ array entries to store the vertex headers.
    *   $\sum_{u \in V} \text{deg}(u) = |E|$ list nodes for directed graphs, or $2|E|$ for undirected graphs.
*   **Efficiency:** Accessing the neighbors of $u$ takes $\Theta(\text{deg}(u))$ time, which is optimal.

#### 3. Implicit Graph Representation
*   **Concept:** The graph is not stored explicitly in computer memory. Instead, vertices are states generated on demand, and a neighbor function `adj(u)` executes game rules or mathematical transformations to compute valid adjacent states on the fly.
*   **Importance:** Essential for massive state spaces (e.g., Rubik's Cube with $4.3 \times 10^{19}$ states, chess configurations) where storing $V$ and $E$ in RAM is physically impossible.

---

## 3. Configuration Graphs & State Spaces

### Modeling Puzzles as Graphs
A **Configuration Graph** models discrete physical systems and puzzles:
*   **Vertex:** A specific configuration or board state.
*   **Edge:** A legal transition or valid move between states.
*   **Example (The 2×2×2 Pocket Cube — as shown in MIT 6.006 Lecture 13):**
    *   **Vertices (states):** Each possible physical configuration of the cube.
    *   **Edges (moves):** Each possible quarter-turn move transitions one state to another.
    *   **Number of vertices calculation (as written on board):**
        $$\text{# vertices} = \frac{8! \times 3^8}{24} \div 3 = \frac{264{,}539{,}520}{24 \times 3} \approx 3{,}674{,}160$$
        *   $8!$ = permutations of 8 corner pieces
        *   $3^8$ = orientations of 8 corners
        *   Divide by **24**: 24 rotational symmetries (overall cube rotations)
        *   Divide by **3**: only 1/3 of corner orientations are reachable via legal moves
    *   **God's Number (Diameter):** The maximum distance from any configuration to the solved state.
        *   **14 quarter turns** (or **11 half turns**) — as stated in the lecture.

### BFS on the Pocket Cube (Backward Search from "Solved")
The lecturer demonstrated a **backward BFS** starting from the solved state:

```
BFS Tree — Backward from "solved" state (as drawn on board):

          [solved]            ← Level 0 (root)
         /   |   \  \
        o    o    o   o       ← Level 1: states reachable in 1 move (possible moves)
       /|   /|  ...  ...
      o  o o  o               ← Level 2: states "reachable in 2" moves
```

By doing BFS from "solved", we find all configurations reachable in exactly $k$ moves — 
this is equivalent to finding God's Number (the diameter of the configuration graph).

---


## 4. Breadth-First Search (BFS)

### Algorithm Design & Layered Exploration
Breadth-First Search systematically explores all vertices reachable from a starting vertex $s$ layer by layer according to their distance from $s$:
*   **Level 0:** $\{s\}$
*   **Level 1:** All immediate neighbors of $s$.
*   **Level 2:** All unvisited neighbors of Level 1 vertices.
*   **Level $i$:** All unvisited neighbors of Level $i-1$ vertices.

### Core Data Structures
1.  `level`: A dictionary/hash map mapping each discovered vertex $v$ to its shortest path distance $\text{dist}(s, v)$.
2.  `parent`: A dictionary mapping each discovered vertex $v$ to the parent node $u$ that discovered it.
3.  `frontier`: A list/queue containing all vertices at the current level $i-1$.

---

### Detailed BFS Algorithm (Python Implementation)

```python
def breadth_first_search(adj, s):
    """
    Perform Breadth-First Search on a graph starting from source vertex s.
    
    Parameters:
        adj: Adjacency list mapping u -> list of neighbors
        s:   Starting source vertex
        
    Returns:
        level:  Dict mapping vertex -> shortest distance from s
        parent: Dict mapping vertex -> parent node in shortest-path tree
    """
    level = {s: 0}
    parent = {s: None}
    frontier = [s]
    i = 1

    while frontier:
        next_level = []
        for u in frontier:
            for v in adj[u]:
                if v not in level:
                    level[v] = i
                    parent[v] = u
                    next_level.append(v)
        frontier = next_level
        i += 1

    return level, parent
```

---

## 5. Shortest Path Reconstruction

BFS constructs a **Shortest-Path Tree** rooted at $s$. To retrieve the optimal path from $s$ to any reachable target $t$:

1.  Start at $t$.
2.  Follow `parent[t]` iteratively back to $s$.
3.  Reverse the accumulated sequence.

```python
def reconstruct_shortest_path(parent, s, t):
    """Reconstruct the shortest path from s to t using BFS parent pointers."""
    if t not in parent:
        return None  # t is not reachable from s
    
    path = []
    curr = t
    while curr is not None:
        path.append(curr)
        curr = parent[curr]
    
    path.reverse()
    return path
```

---

## 6. Mathematical Complexity Analysis

### Time Complexity: $O(V + E)$
*   **Vertex Initialization:** Each reachable vertex enters the `frontier` list **at most once** because a vertex is only added if `v not in level`. Once added, `level[v]` is permanently set. Total vertex processing: $O(V)$.
*   **Edge Traversals:** The adjacency list `adj[u]` is iterated over only when $u$ is in the frontier. Thus, each directed edge $(u, v)$ is inspected exactly once:
    $$\sum_{u \in V} \text{deg}(u) = |E|$$
*   **Combined Time Complexity:**
    $$T(V, E) = O(V + E)$$
    This running time is **linear in the size of the graph** and is asymptotically optimal.

### Space Complexity:
*   Explicit Graph: $\Theta(V + E)$ for the adjacency list + $O(V)$ for `level`, `parent`, and `frontier`.
*   Implicit Graph: $O(V)$ space (only storing `level` and `parent` for visited states).

---

## 7. Real-World Applications

| Application | Vertices | Edges | BFS Goal |
|---|---|---|---|
| **Web Crawling** | Web pages (URLs) | Hyperlinks | Indexing reachable internet pages |
| **Social Networks** | User profiles | Friendships / Follows | Degrees of separation, friend suggestions |
| **Network Routing** | Routers / Switches | Network cables / links | Broadcasting packets with minimum hops |
| **Garbage Collection** | Memory chunks | Pointers / references | Finding and freeing unreferenced memory |
| **State Verification** | Circuit/Code states | Valid transitions | Model checking for unreachable error states |

---

## 8. Exam-Focused Points

### High-Yield Definitions & Distinctions
*   **BFS Guarantees:** BFS guarantees the **shortest path in unweighted graphs** (i.e., path with the minimum number of edges). It does *not* compute shortest paths for graphs with variable edge weights (Dijkstra's algorithm is required for that).
*   **Handling Cycles:** BFS avoids infinite loops in cyclic graphs by maintaining the `level` set / dictionary. If $v \in \text{level}$, the algorithm skips it.
*   **Diameter of a Graph:** The largest shortest-path distance between any pair of vertices ($\max_{u, v} \text{dist}(u, v)$).
*   **Adjacency Matrix vs. Adjacency List:**
    *   *Adjacency Matrix:* Space $\Theta(V^2)$, neighbor scan $O(V)$, checking edge existence $O(1)$.
    *   *Adjacency List:* Space $\Theta(V + E)$, neighbor scan $O(\text{deg}(u))$, checking edge existence $O(\text{deg}(u))$.
    *   For sparse graphs ($E \ll V^2$), Adjacency List is vastly superior.

---

## Quick Revision

1.  **Graph Representation:** Adjacency List is the standard choice requiring optimal $\Theta(V + E)$ space.
2.  **Implicit Representation:** Essential for massive state spaces like puzzle configurations where storing every node in RAM is infeasible.
3.  **BFS Concept:** Explores the graph layer by layer ($\text{distance } 0, 1, 2, \dots$) using a frontier queue.
4.  **Shortest Paths:** In an unweighted graph, BFS computes the optimal shortest path from $s$ to all reachable vertices.
5.  **Parent Pointers:** Construct a shortest-path tree that allows backtracking from target $t$ to source $s$.
6.  **Optimal Complexity:** BFS runs in $O(V + E)$ time, which is linear in the input size.
7.  **Key Applications:** Web search indexing, social network analysis, network routing, and automated puzzle solving.
