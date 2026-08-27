# Lecture Summary

## 1. Introduction
Graph search is the process of systematically exploring a graph. This exploration can serve several purposes, such as finding a path between a starting node $s$ and a target node $t$, discovering all reachable nodes or edges from a given source, or exploring the entire graph. 

A **graph** is formally defined as a set of vertices $V$ and a set of edges $E$. Edges can be:
*   **Unordered pairs** (representing an **undirected graph**)
*   **Ordered pairs** (representing a **directed graph**)

## 2. Main Concepts

### Graph Representation
To perform graph algorithms efficiently, the graph must be represented appropriately in computer memory:
*   **Edge List (Inefficient):** Storing a simple array of vertices and an array of edges. This is highly inefficient because finding the neighbors of a given vertex $u$ requires scanning the entire edge list, resulting in linear time $O(E)$ just to identify possible moves.
*   **Adjacency List (Standard):** An array (or hash table) `adj` of size $|V|$. For each vertex $u$, `adj[u]` stores a pointer to a list containing all its neighbors (vertices $v$ such that there is an edge from $u$ to $v$). 
*   **Implicit Representation:** Instead of storing the graph structure explicitly in memory, the neighbor list `adj[u]` is computed dynamically using a function or method. This is highly useful for massive graphs where storing the entire state space is impossible due to memory limits.

### Adjacency List Space Complexity
The space complexity of an explicit adjacency list is $\Theta(V + E)$. This is optimal because it is linear in the size of the graph (storing $|V|$ vertices and a total of $|E|$ or $2|E|$ list nodes representing edges).

### Breadth-First Search (BFS)
BFS is a fundamental graph search algorithm designed to explore all nodes reachable from a given source vertex $s$ layer-by-layer. 
*   **Layer-by-Layer Strategy:** It explores nodes reachable in 0 moves (the source $s$), then nodes reachable in 1 move, then 2 moves, and so on.
*   **Duplicate Avoidance:** To prevent infinite loops (especially in graphs with cycles) and ensure optimal running time, BFS tracks visited vertices. If a vertex has already been assigned a level, it is ignored during subsequent encounters.

#### BFS Algorithm (Python-style Pseudocode)
```python
level = {s: 0}
parent = {s: None}
i = 1
frontier = [s]

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
```

## 3. Examples

### Configuration Graph
In puzzles like the Rubik's Cube, the state space can be modeled as a **Configuration Graph**:
*   **Vertices:** Each possible physical state or configuration of the puzzle.
*   **Edges:** Legal moves that transition the puzzle from one state to another (e.g., quarter twists). Because moves are reversible, this graph is undirected.
*   For complex puzzles, an **implicit representation** is preferred. Rather than allocating gigabytes to store all states, we represent the current state and dynamically generate adjacent states using legal move rules.

### Real-World Applications of BFS
*   **Web Crawling:** Indexing web pages by starting from a seed page and following hyperlinks.
*   **Social Networks:** Tries to find degrees of separation or near connections (e.g., Friend Finder).
*   **Network Broadcasting:** Propagating a packet through a network to reach all connected nodes.
*   **Garbage Collection:** Identifying and reclaiming memory blocks that are no longer reachable from any active program variables.
*   **Model Checking:** Iterating through reachable states of a circuit or program to verify specific safety properties.

## 4. Formulas / Mathematical Concepts

*   **2x2x2 Rubik's Cube State Space:** The upper bound on the number of possible physical configurations is:
    $$|V| = 8! \times 3^8$$
    *(This is roughly 264 million states. Symmetries and reachability rules reduce the actual reachable state space to $1/3$ of this value).*
*   **Graph Diameter ("God's Number"):** The maximum of the shortest path distances between any pair of vertices in a graph. It represents the worst-case scenario for an optimal solver.
    *   For a 2x2x2 Rubik's Cube, the diameter is **11** moves.
    *   For a 3x3x3 Rubik's Cube, the diameter is **20** moves.
    *   For an $n \times n \times n$ Rubik's Cube, the asymptotic diameter is:
        $$\Theta\left(\frac{n^2}{\log n}\right)$$
*   **Handshaking Lemma:** The sum of the degrees of all vertices in an undirected graph equals twice the number of edges:
    $$\sum_{v \in V} |adj[v]| = 2|E|$$
    *(For directed graphs, the sum of out-degrees equals $|E|$).*

## 5. Important Points

### Shortest Path Property
BFS naturally computes **shortest paths** in terms of the minimum number of edges traversed. 
*   **Level Tracker:** The dictionary value `level[v]` stores the exact shortest path distance from the source $s$ to vertex $v$.
*   **Parent Pointers:** The dictionary `parent` forms a tree (the BFS tree) rooted at $s$. Following parent pointers backward from any reachable node $v$ to $s$ (i.e., $v \rightarrow parent[v] \rightarrow parent[parent[v]] \rightarrow \dots \rightarrow s$) constructs a shortest path.

### Complexity Analysis
*   Each reachable vertex is added to the `frontier` exactly once.
*   The adjacency list of each vertex is scanned only once (when the vertex is popped from the frontier).
*   According to the Handshaking Lemma, scanning all adjacency lists takes $\Theta(E)$ time.
*   With initialization costing $\Theta(V)$, the total running time of BFS is:
    $$\Theta(V + E)$$

## 6. Final Takeaways
*   **Adjacency lists** are the most efficient general-purpose graph representation, utilizing optimal $\Theta(V + E)$ space.
*   **Implicit representations** enable search algorithms to run on extremely large or infinite graphs without storing the entire vertex set in memory.
*   **BFS** is a highly efficient linear-time algorithm ($\Theta(V+E)$) that guarantees finding the shortest path from a source node to all reachable nodes in an unweighted graph.

---

## Quick Revision
1.  **Graph Representation:** Adjacency lists require optimal $\Theta(V + E)$ space and allow fast $O(1)$ lookup of neighbors, whereas edge lists require inefficient linear searches.
2.  **Implicit Representation:** A technique where neighbor states are generated dynamically by a function, saving memory in massive state spaces like the Rubik's Cube.
3.  **Breadth-First Search (BFS):** Explores a graph layer-by-layer, starting from distance 0, then 1, then 2, etc.
4.  **BFS Time Complexity:** Runs in optimal linear time $\Theta(V + E)$ because it visits each reachable node and edge a constant number of times.
5.  **Shortest Paths:** In unweighted graphs, BFS is guaranteed to find paths with the minimum number of edges.
6.  **BFS Tree:** Constructed using `parent` pointers, allowing the reconstruction of the shortest path from the source $s$ to any reachable node $v$ in reverse.
7.  **Graph Diameter:** The maximum of the shortest path lengths in a graph. For a 2x2x2 cube, it is 11 moves; for a 3x3x3 cube, it is 20 moves.