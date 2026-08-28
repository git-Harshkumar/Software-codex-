# Detailed Lecture Notes — Graph Search and Breadth-First Search (BFS)

---

## 1. Introduction to Graph Search & Basics

**Graph Search** ka basic matlab hai ek graph ko systematically explore karna. Graph search algorithms ka use hum kai tarah ki problems solve karne ke liye karte hain, jaise:
*   Kisi start node $s$ se target node $t$ tak ka **path dhoondhna** (Jaise Rubik's Cube ki initial state se solved state tak ka path).
*   Start node $s$ se reachable sabhi nodes ko explore karna.
*   Graph ke saare vertices ya saare edges ko systematically visit karna.

### Graph Definition
Ek graph $G$ do cheezon se milkar banta hai:
$$G = (V, E)$$

*   **Vertices ($V$):** Graph ke nodes ka set.
*   **Edges ($E$):** Connections ka set jo vertices ko join karta hai. Edges do tarah ki ho sakti hain:
    1.  **Unordered Pairs (Undirected Graph):** Agar edges unordered pairs hain (yaani set of 2 items), toh graph **Undirected** hota hai. Isme movement dono directions mein ho sakta hai (e.g., $\{u, v\}$).
    2.  **Ordered Pairs (Directed Graph):** Agar edges ordered pairs hain, toh graph **Directed** hota hai (e.g., $(u, v)$, jahan edge $u$ se start hokar $v$ par end hoti hai).

#### Example (Lecture ke board par dikhaya gaya):
*   **Undirected Graph Example (MIT 6.006 board se):** 
    *   $V = \{a, b, c, d\}$
    *   $E = \{\{a,b\}, \{a,c\}, \{b,c\}, \{c,d\}\}$
*   **Directed Graph Example (MIT 6.006 board se):**
    *   $V = \{a, b, c\}$
    *   $E = \{(a,c), (b,a), (b,c), (c,b)\}$
    *   (Note: $b$ aur $c$ ke beech bidirectional arrows hain — $b \to c$ aur $c \to b$ dono hain)

---

## 2. Graph Representations

Hum computers mein graphs ko kaise represent karte hain? Yeh humare algorithms ki efficiency decide karta hai.

### Naive/Bad Representation (Edge List)
Agar hum sirf do arrays rakhein—ek vertices ki array aur ek edges ki array (jahan har edge apne endpoints ko janti hai)—toh yeh ek kharab representation hoga. 
*   **Problem:** Agar aap vertex $A$ par hain aur uske neighbors dhoondhna chahte hain, toh aapko puri edge list ko scan karna padega, jo linear time $O(E)$ lega.

### Adjacency Lists (Standard Representation)
Sabse standard aur efficient representation **Adjacency List** hai.
*   Isme hum size $|V|$ ka ek array `adj` banate hain.
*   Is array ka har element ek linked list (ya pointer) hota hai jo us vertex ke neighbors ko store karta hai.
*   **Definition:** 
    $$adj[u] = \{v \in V \mid (u, v) \in E\}$$

#### Example (Directed Graph):
Agar graph mein edges $B \rightarrow A$, $B \rightarrow C$, $A \rightarrow C$, aur $C \rightarrow B$ hain:
*   `adj[a]` = `[c]`
*   `adj[b]` = `[a, c]`
*   `adj[c]` = `[b]`

#### Adjacency List ko implement karne ke tarike:
1.  **Array of Linked Lists:** Agar vertices $0$ se $|V|-1$ tak indexed hain, toh hum simple array use kar sakte hain. Python mein hum iske liye **Hash Table (Dictionary)** use karte hain jisme keys vertices hote hain.
2.  **Object-Oriented Representation:** Har vertex ek object hota hai, aur `v.neighbors` ek attribute/list hoti hai jo neighbors ko store karti hai. (Yeh clean hai, par isme ek vertex ek se zyada graphs ka part nahi ban sakta).
3.  **Implicit Representation:** Isme hum poore graph ko memory mein store nahi karte. `adj(u)` ek function ya method hota hai jo call karne par vertex $u$ ke neighbors ko dynamically compute karta hai. 
    *   *Usage:* Jab state-space bohot bada ho (jaise Rubik's Cube), tab hum implicit representation use karte hain taaki space save ho sake.

### Space Complexity of Adjacency List
Explicit Adjacency List representation ke liye space complexity hoti hai:
$$\Theta(V + E)$$

*   $V$ space vertices ko array/dictionary mein store karne ke liye chahiye.
*   $E$ space total edges store karne ke liye chahiye. Undirected graphs mein har edge do baar store hoti hai ($2|E|$ half-edges), jo asymptomatically $\Theta(E)$ hi hai. Yeh representation space-optimal hai.

---

## 3. Real-World Applications of Graph Search

1.  **Web Crawling (Google):** Links ko follow karke web pages explore karna. Google prioritised BFS-like search use karta hai nayi sites index karne ke liye.
2.  **Social Networks (Facebook Friend Finder):** "Friends of friends" dhoondhne ke liye level-2 search karna.
3.  **Network Broadcasting:** Kisi network ya internet par message packet ko broadcast karna ek graph exploration problem hai.
4.  **Garbage Collection:** Modern programming languages (like Java, Python) unreachable memory ko free karne ke liye BFS use karti hain. Active variables se starting karke jo memory locations unreachable hoti hain, unhe clear kar diya jata hai.
5.  **Model Checking:** Kisi circuit ya software program ke saare reachable states ko explore karke prove karna ki system correct kaam kar raha hai.
6.  **Checking Mathematical Conjectures:** Finite states ke finite graph ko explore karke counter-examples dhoondhna.
7.  **Solving Puzzles:** Rubik's cube jaise puzzles ko optimally solve karna.

---

## 4. Rubik's Cube Example (Pocket Cube 2x2x2)

Rubik's cube ko hum ek **Configuration Graph** ki tarah treat kar sakte hain:
*   **Vertices ($V$):** Cube ki har ek possible unique state.
*   **Edges ($E$):** Har ek legal move (quarter twist). Kyunki moves ko undo kiya ja sakta hai, isliye yeh graph **undirected** hota hai.

### Pocket Cube (2x2x2) Calculations:
*   Ek 2x2x2 cube mein 8 small "cubelets" (cubies) hote hain.
*   In 8 cubies ko permute karne ke $8!$ tarike hain.
*   Har cubie ke paas 3 possible twists (orientations) hote hain.
*   Isliye total mathematical configurations/states hoti hain:
    $$|V| = 8! \times 3^8 \approx 264 \text{ million vertices}$$
*   *Symmetries and Reachability:* Hum is number ko 24 se divide kar sakte hain (symmetries ke liye) aur 3 se divide kar sakte hain (kyunki physically sirf $1/3$ states hi reachable hain bina cube ko khole). Phir bhi yeh number computers ke liye easily searchable hai.
*   *Note on larger cubes:* 7x7x7 ya 5x5x5 cube ke states pure universe ke particles ($\approx 10^{80}$) se bhi zyada hain, isliye unka poora explicit graph banana impossible hai.

### Diameter of the Graph & God's Number
Graph theory mein graph ke maximum shortest path ko **Diameter** kehte hain. Puzzlers ise **God's Number** bhi kehte hain—yaani worst-case state se solve state tak pahunchne ke liye minimum kitne moves lagenge (assuming optimal play).
*   **2x2x2 Cube:** God's Number is **11** (quarter twists aur half twists ke cases mein).
*   **3x3x3 Cube:** God's Number is **20** (ise solve karne mein kai saal ka computer time laga tha).
*   **$n \times n \times n$ Cube Asymptotics:** Standard algorithms $\Theta(n^2)$ moves lete hain, par optimal algorithms ke liye asymptotic diameter hota hai:
    $$\Theta\left(\frac{n^2}{\log n}\right)$$

---

## 5. Breadth-First Search (BFS) Algorithm

**BFS** ka goal start node $s$ se reachable sabhi nodes ko level-by-level explore karna hai in $\Theta(V + E)$ time.

### BFS Core Mechanism
1.  Pehle level 0 (sirf $s$) ko visit karo.
2.  Fir level 1 (nodes reachable in 1 step from $s$) ko visit karo.
3.  Fir level 2, level 3, and so on.
4.  **Avoiding Duplicates:** Agar hum pehle se visited nodes ka record nahi rakhenge, toh cyclic graphs mein algorithm infinite loop mein chala jayega.

### Python Code
```python
def bfs(adj, s):
    level = {s: 0}       # Visited nodes aur unka level/distance store karne ke liye
    parent = {s: None}   # Shortest path trace karne ke liye parent pointers
    i = 1
    frontier = [s]       # Jo nodes abhi explore ho rahi hain (Level i-1)
    
    while frontier:
        next_frontier = []  # Agli level ke nodes (Level i)
        for u in frontier:
            for v in adj[u]:
                if v not in level:
                    level[v] = i
                    parent[v] = u
                    next_frontier.append(v)
        frontier = next_frontier
        i += 1
```

---

### BFS Execution Trace (Example from Lecture)

Maan lijiye humare paas niche diya gaya undirected graph hai, aur humara start node $s$ hai:

```
    (z) ——— (a) ——— (s) ——— (x) ——— (c) ——— (v)
                             \     /   \   /
                              (d)         (f)
```

#### Step-by-Step execution:

1.  **Initialization:**
    *   `level = {s: 0}`, `parent = {s: None}`
    *   `frontier = [s]`, `i = 1`

2.  **Iteration 1 (i = 1):**
    *   `frontier` ke element $s$ ke neighbors scan kiye: $a$ aur $x$.
    *   Dono `level` mein nahi hain, toh:
        *   `level[a] = 1`, `parent[a] = s`
        *   `level[x] = 1`, `parent[x] = s`
        *   `next_frontier = [a, x]`
    *   `frontier` becomes `[a, x]`, `i` increments to 2.

3.  **Iteration 2 (i = 2):**
    *   **For $a$:** Neighbors are $s$ (visited) and $z$ (unvisited).
        *   `level[z] = 2`, `parent[z] = a`
    *   **For $x$:** Neighbors are $s$ (visited), $d$ (unvisited), and $c$ (unvisited).
        *   `level[d] = 2`, `parent[d] = x`
        *   `level[c] = 2`, `parent[c] = x`
    *   `frontier` becomes `[z, d, c]`, `i` increments to 3.

4.  **Iteration 3 (i = 3):**
    *   **For $z$:** Neighbor is $a$ (visited).
    *   **For $d$:** Neighbors are $x$ (visited), $c$ (visited), and $f$ (unvisited).
        *   `level[f] = 3`, `parent[f] = d`
    *   **For $c$:** Neighbors are $x, d, f$ (all processed/visited), and $v$ (unvisited).
        *   `level[v] = 3`, `parent[v] = c`
    *   `frontier` becomes `[f, v]`, `i` increments to 4.

5.  **Iteration 4 (i = 4):**
    *   **For $f$ & $v$:** Inke saare neighbors ($d, c, f, v$) pehle se visited hain.
    *   `next_frontier` empty ho jata hai.
    *   `while` loop terminates.

---

### Shortest Path Properties
BFS algorithm ki sabse badi khasiyat yeh hai ki yeh **shortest path** (in terms of minimum number of edges) dhoondhta hai:
1.  **Level represents Distance:** Kisi bhi node $v$ ke liye, `level[v]` start node $s$ se uski shortest distance (fewest edges) hoti hai.
2.  **Parent Pointers Tree:** `parent` dictionary ek tree form karti hai jiska root $s$ hota hai.
3.  **Path Reconstruction:** Agar hum kisi node $v$ se start karke uske parent pointers ko trace karein jab tak $s$ na mil jaye:
    $$v \rightarrow parent[v] \rightarrow parent[parent[v]] \dots \rightarrow s$$
    Aur is list ko reverse kar dein, toh hume $s$ se $v$ ka **shortest path** mil jata hai.

### Time Complexity Analysis
BFS ka total running time hai:
$$\Theta(V + E)$$

*   **Vertices:** Har vertex `frontier` mein maximum ek hi baar aa sakta hai, kyunki ek baar level set hone ke baad use dobara process nahi kiya jata. Isliye vertices initialization aur loop management $\Theta(V)$ time leta hai.
*   **Edges:** Jab koi vertex frontier mein aata hai, tabhi hum uski adjacency list scan karte hain. Isliye total edges scan karne ka cost hai:
    $$\sum_{v \in V} |adj[v]|$$
    *   Undirected graphs ke liye, yeh value $2|E|$ (Handshaking Lemma) hoti hai.
    *   Directed graphs ke liye, yeh $|E|$ hoti hai.
    *   Dono hi cases mein edge scanning $\Theta(E)$ time leti hai.
*   Total running time: $\Theta(V + E)$ (Linear Time).

---

## 6. Exam-Focused Points

### Key Definitions for Exams
*   **Adjacency List Space Complexity:** $\Theta(V + E)$ space efficiency optimal hoti hai kyunki yeh directly graph ke size ke proportional hai.
*   **Implicit Representation:** Is representation mein graph structures dynamically functional calls se generate hote hain. Ye tab useful hai jab graph bohot bada ho aur explicitly store na kiya ja sake (e.g., Rubik's Cube state space).
*   **God's Number / Diameter:** Kisi graph ke sabhi pairs ke shortest paths mein jo sabse bada shortest path (maximum distance) hota hai, use Diameter kehte hain.

### Handshaking Lemma
$$\sum_{v \in V} \text{deg}(v) = 2|E|$$
Undirected graph mein sabhi vertices ke degrees (ya neighbors) ka sum double the number of edges hota hai. BFS complexity proof mein iska direct use hota hai.

### Important Distinctions
*   **BFS vs. Naive Exploration:** BFS levels follow karta hai (breadth-first) isliye shortest path guarantee karta hai unweighted graphs mein. Naive algorithms cyclic graphs mein bina duplicate-check ke loop ho sakte hain.
*   **Directed vs Undirected Space:** Dono cases mein space asymptotic complexity $\Theta(V + E)$ hi hoti hai, par undirected mein half-edges ki wajah se actual edges representation size double ($2|E|$) ho jata hai.

---

## 7. Quick Revision

1.  **Graph Representation:** Adjacency List $\Theta(V + E)$ space leti hai aur optimal hai. Linear scan edge lists are highly inefficient.
2.  **BFS Goal:** Start vertex $s$ se reachable sabhi nodes ko explore karna aur shortest path (fewest edges) dhoondhna.
3.  **Duplicates Prevention:** BFS duplicate entries se bachne ke liye `level` dictionary ka use karta hai. Isse cycles mein infinite recursion nahi hota.
4.  **Shortest Path:** BFS tree mein parent pointers ko backtrack karke hum minimum-edge path reconstruct kar sakte hain. Path length `level[v]` ke barabar hoti hai.
5.  **Time Complexity:** BFS linear time $\Theta(V + E)$ mein chalta hai kyunki har node ek baar frontier banti hai aur har edge maximum do baar check hoti hai.
6.  **Implicit Graphs:** Jab state space massive ho (jaise Rubik's Cube with 264M+ states), tab implicit representation memory bachaane mein help karti hai.
7.  **God's Number:** 2x2x2 Rubik's Cube ke liye optimal solutions ka diameter (God's Number) **11 moves** hai, aur 3x3x3 ke liye **20 moves** hai.
8.  **Asymptotics for n-cube:** $n \times n \times n$ Rubik's cube ko optimally solve karne ke liye diameter $\Theta(n^2 / \log n)$ asymptotically vary karta hai.