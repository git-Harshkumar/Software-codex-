# Lecture Summary (Hinglish)

## 1. Introduction
Graph Search ka matlab hai kisi graph $G = (V, E)$ ko systematically explore karna. Iska use alag-alag problems solve karne ke liye hota hai:
*   **Path Finding:** Node $s$ se node $t$ tak ka best path find karna.
*   **Reachable Nodes:** Node $s$ se reachable saare vertices discover karna.
*   **Complete Exploration:** Pure graph ke vertices aur edges ko traverse karna.

---

## 2. Main Concepts

### Graph Representations
*   **Edge List (Bad Choice):** Vertices aur edges ki simple list. Isme kisi node ke neighbors dhoondhne ke liye puri list scan karni padti hai, jisme $O(E)$ time lagta hai.
*   **Adjacency List (Standard Choice):** Size $|V|$ ka array ya dictionary `adj`. Har node $u$ ke liye `adj[u]` uske saare neighbors ki list rakhta hai. Iska space $\Theta(V + E)$ hota hai.
*   **Implicit Graph:** Puzzles (jaise Rubik's Cube) jahan billions of states hote hain, graph memory mein store nahi hota balki moves ke rules se dynamically create hota hai.

### Breadth-First Search (BFS)
BFS source node $s$ se layer-by-layer explore karta hai:
*   **Level 0:** $\{s\}$
*   **Level 1:** $s$ ke direct neighbors.
*   **Level 2:** Level 1 ke unvisited neighbors.
*   **Level $i$:** Level $i-1$ ke unvisited neighbors.

```python
def bfs(adj, s):
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

## 3. Shortest Path & Examples

### Shortest Path Reconstruction
BFS se shortest path nikalne ke liye `parent` pointers ko target node $t$ se start karke backtrack karte hain jab tak `s` na mil jaye:
```python
def get_path(parent, s, t):
    path = []
    curr = t
    while curr is not None:
        path.append(curr)
        curr = parent[curr]
    path.reverse()
    return path
```

### Real-World Applications
1.  **Web Crawlers:** URLs ko layer-by-layer visit karna.
2.  **Social Networks:** Degrees of separation aur friend recommendations (e.g. Mutual Friends).
3.  **Network Routing:** Minimum hops mein packets deliver karna.
4.  **Garbage Collection:** Unreachable memory blocks ko identify karke free karna.

---

## 4. Mathematical Complexity Analysis

*   **Time Complexity:** $O(V + E)$
    *   Har vertex frontier mein maximum ek baar aata hai $\rightarrow O(V)$
    *   Har edge ko ek baar check kiya jata hai $\rightarrow \sum \text{deg}(u) = |E|$
    *   Total Time: **$O(V + E)$ (Linear & Optimal)**
*   **Space Complexity:** $\Theta(V + E)$ for explicit graph, $O(V)$ for implicit graph.

---

## 5. Exam-Focused Points

*   **Unweighted Shortest Path:** BFS sirf **unweighted graphs** mein shortest path ki guarantee deta hai (weighted graphs ke liye Dijkstra algorithm use hota hai).
*   **Cycle Handling:** `level` dictionary visited nodes ko track karke infinite recursion se bachati hai.
*   **Graph Diameter:** Graph ke kisi bhi do vertices ke beech ka longest shortest-path distance.

---

## Quick Revision
1. **Adjacency List** optimal $\Theta(V + E)$ space leti hai.
2. **Implicit Representation** tab use hoti hai jab state space memory mein fit na ho sake.
3. **BFS** graph ko layer-by-layer traverse karta hai.
4. `parent` pointers se shortest path reconstruct kiya jata hai.
5. BFS ka time complexity **$O(V + E)$** hai.
