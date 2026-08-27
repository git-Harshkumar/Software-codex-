# Lecture Overview

## Main Idea
The lecture introduces **Graph Search** as a fundamental method for exploring graphs and solving state-space problems. It focuses on **Breadth-First Search (BFS)**, an algorithm that explores a graph layer-by-layer starting from a source vertex, and examines the efficiency of different graph representations in memory.

## Key Concepts
*   **Graph Representations:**
    *   **Adjacency List:** The standard explicit representation of a graph, consisting of an array or hash table indexed by vertices, where each entry points to a list of that vertex's neighbors. It requires $\Theta(V + E)$ space.
    *   **Implicit Graphs:** A representation where neighbor vertices are computed dynamically on the fly using a function or method rather than being stored explicitly. This saves massive amounts of space for large configuration spaces.
*   **Breadth-First Search (BFS):**
    *   An exploration algorithm that visits vertices layer-by-layer based on their distance (number of moves) from a starting node.
    *   Uses a "frontier" queue structure to transition from one layer to the next.
    *   Avoids duplicate processing and infinite loops in cyclic graphs by tracking visited vertices in a level dictionary.
*   **Shortest Paths & Parent Pointers:**
    *   BFS naturally computes the shortest path (minimum number of edges) from a source node to all reachable nodes.
    *   By tracking each node's "parent" (the node from which it was discovered), BFS constructs a shortest-path tree. Reversing these parent pointers reconstructs the optimal path back to the source.
*   **BFS Complexity:**
    *   **Time Complexity:** $O(V + E)$, which is linear in the size of the graph.
    *   **Space Complexity:** $O(V + E)$ for explicit storage, or down to $O(V)$ if the graph is represented implicitly.

## Important Definitions
*   **Adjacency List (`adj[u]`):** The set of all vertices $v$ such that there is an edge from $u$ to $v$.
*   **Frontier:** The set of vertices newly reached at the current layer (level $i-1$) used to discover the next layer (level $i$).
*   **Diameter (or "God's Number"):** The worst-case shortest-path distance between any two vertices in a graph.

## Takeaway
Breadth-First Search is a highly efficient, optimal algorithm for finding shortest paths in unweighted graphs. By organizing the search into layers and tracking visited vertices, it runs in optimal $O(V + E)$ time and forms the foundation of many practical applications, from puzzle-solving to network routing and garbage collection.

***

## Quick Revision
1. **Graph Search** is the process of exploring vertices and edges to solve pathfinding and connectivity problems.
2. An **Adjacency List** is the most efficient explicit graph representation, requiring $\Theta(V + E)$ space and allowing constant-time access to a vertex's neighbors.
3. An **Implicit Graph** representation computes neighbor states dynamically, which is essential for massive state spaces where explicit storage is impossible.
4. **BFS** searches a graph layer-by-layer, starting from a source node $s$ (level 0, level 1, level 2, etc.).
5. To prevent infinite loops caused by cycles, BFS records the **level** of each discovered node and ignores already-visited nodes.
6. The **frontier** in BFS stores the nodes discovered at the current distance layer before transitioning to the next.
7. **Parent pointers** recorded during BFS form a tree that allows reconstruction of the shortest path (fewest edges) from the source to any reachable node.
8. The **time complexity of BFS is $O(V + E)$** because each vertex enters the frontier once, and its outgoing edges are scanned a constant number of times.