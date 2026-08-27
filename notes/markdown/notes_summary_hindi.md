# Lecture Summary

## 1. Introduction
इस lecture में **Graph Search** और उसके बुनियादी सिद्धांतों को समझाया गया है। Graph search का मुख्य उद्देश्य किसी graph को explore (खोज) करना है। उदाहरण के लिए, किसी graph में एक node $s$ से दूसरे node $t$ के बीच path खोजना। 

इस concept को समझाने के लिए **Rubik's Cube** (विशेष रूप से 2x2x2 Pocket Cube) का उदाहरण दिया गया है, जिसे graph search algorithms का उपयोग करके optimally solve किया जा सकता है।

### Graph Search के प्रमुख Applications:
* **Web Crawling:** Search engines (जैसे Google) द्वारा links को follow करके नए web pages को खोजना और index करना।
* **Social Networking:** Friends of friends खोजने के लिए (जैसे Facebook का Friend Finder)।
* **Network Broadcasting:** Network में messages या packets को प्रसारित करना।
* **Garbage Collection:** Programming languages (जैसे Python, Java) में unreachable data structures को पहचानना ताकि memory को free किया जा सके।
* **Model Checking:** किसी circuit या computer program की सभी reachable states को verify करना कि वे सही से काम कर रही हैं या नहीं।
* **Mathematical Conjectures:** गणितीय अनुमानों को जांचने के लिए परिमित (finite) विशेष मामलों में counter-examples खोजना।

---

## 2. Main Concepts

### Concept A: Graph Basics
एक Graph $G$ दो मुख्य चीज़ों से मिलकर बनता है:
1. **Vertices ($V$):** Nodes का एक set.
2. **Edges ($E$):** Vertices को जोड़ने वाली links का set.

* **Undirected Graph:** इसमें edges unordered pairs होती हैं (यानी, दोनों दिशाओं में travel किया जा सकता है)।
* **Directed Graph:** इसमें edges ordered pairs होती हैं (यानी, edge की एक निश्चित दिशा होती है)।

### Concept B: Graph Representations
Graph को computer memory में represent करने के कई तरीके हैं:

1. **Edge List (एक खराब representation):**
   * इसमें vertices और edges की simple arrays होती हैं।
   * यह एक **horrible representation** है क्योंकि यदि आपको किसी node $A$ के neighbors खोजने हैं, तो आपको पूरी edge list को scan करना होगा, जिसमें linear time $O(E)$ लगेगा।

2. **Adjacency Lists (Standard Representation):**
   * इसमें $V$ size का एक array (या hash table) `adj` होता है।
   * Array का प्रत्येक element एक linked list (या dynamic array) का pointer होता है जो उस vertex के सभी neighbors को store करता है।
   * यदि vertex $u$ से $v$ तक कोई edge है, तो $v \in adj[u]$।
   * **Object-Oriented variation:** इसमें vertices को objects की तरह represent किया जाता है, जहाँ प्रत्येक vertex object के पास `v.neighbors` attribute होता है।

3. **Implicit Representations:**
   * इसमें neighbors को memory में explicitly store करने के बजाय, ज़रुरत पड़ने पर एक function `adj(u)` या method `v.neighbors()` का उपयोग करके dynamically compute किया जाता है।
   * यह representation तब बहुत उपयोगी होती है जब graph बहुत बड़ा हो (जैसे Rubik's Cube का state space) और उसे memory में store करना असंभव हो।

### Concept C: Breadth-First Search (BFS)
BFS एक बुनियादी graph search algorithm है जो किसी दिए गए source node $s$ से reachable सभी nodes को layer-by-layer explore करता है।
* यह पहले $s$ को visit करता है (Layer 0)।
* फिर $s$ के direct neighbors को visit करता है (Layer 1)।
* इसके बाद Layer 1 के neighbors को visit करता है जो पहले visit नहीं किए गए हैं (Layer 2), और इसी तरह आगे बढ़ता है।
* **Duplicate Avoidance:** Graph में cycles के कारण infinite loop में फंसने से बचने के लिए, BFS एक `level` dictionary/hash table का उपयोग करता है। एक बार किसी vertex का level set हो जाने पर, उसे दोबारा explore नहीं किया जाता है।

---

## 3. Examples

### Pocket Cube (2x2x2 Rubik's Cube) as a Configuration Graph
* **Vertices:** Cube की प्रत्येक संभव configuration (लगभग 264 million states: $8! \times 3^8$)। symmetries और reachable states को ध्यान में रखकर यह संख्या कम हो जाती है।
* **Edges:** प्रत्येक legal move (quarter twist) vertices के बीच एक undirected edge को दर्शाता है।
* **Diameter (God's Number):** Graph का diameter वह अधिकतम दूरी (shortest path) है जो किन्हीं दो nodes के बीच हो सकती है। 2x2x2 cube के लिए diameter **11** है (यानी किसी भी configuration को अधिकतम 11 moves में solve किया जा सकता है)। 3x3x3 cube के लिए यह diameter **20** है।

---

## 4. Formulas / Mathematical Concepts

* **Adjacency List Space Complexity:** 
  $$\Theta(V + E)$$
  यह representation space के मामले में optimal है।

* **Sum of Adjacency Lists (Handshaking Lemma):**
  $$\sum_{v \in V} |adj[v]| = \begin{cases} 2E & \text{for Undirected Graphs} \\ E & \text{for Directed Graphs} \end{cases}$$

* **BFS Time Complexity:** 
  $$O(V + E)$$

* **Asymptotic Diameter of $n \times n \times n$ Rubik's Cube:** 
  $$\Theta\left(\frac{n^2}{\log n}\right)$$

---

## 5. Important Points

### BFS Algorithm Code (Python Implementation)
```python
def bfs(adj, s):
    level = {s: 0}
    parent = {s: None}
    i = 1
    frontier = [s]
    while frontier:
        next = []
        for u in frontier:
            for v in adj[u]:
                if v not in level:
                    level[v] = i
                    parent[v] = u
                    next.append(v)
        frontier = next
        i += 1
```

### Parent Pointers और Shortest Path Properties:
1. **Shortest Path Property:** BFS द्वारा बनाए गए `parent` pointers एक tree (BFS Tree) बनाते हैं जिसका root source node $s$ होता है।
2. **Path Reconstruction:** यदि हम किसी node $v$ से उसके parent, फिर उसके parent, और इसी तरह $s$ तक पीछे की ओर trace करें, तो हमें $s$ से $v$ के बीच का **shortest path** (fewest edges वाला path) प्राप्त होता है।
3. **Path Length:** इस shortest path की length, `level[v]` के बराबर होती है।

---

## 6. Final Takeaways
* **Adjacency List** graph exploration के लिए सबसे optimal explicit representation है।
* **Implicit representation** का उपयोग करके हम Rubik's Cube जैसी विशाल configuration spaces को बिना पूरी तरह memory में store किए explore कर सकते हैं।
* **BFS** न केवल graph को explore करता है बल्कि unweighted graphs में **shortest paths** ढूंढने का सबसे efficient तरीका है।

---

## Exam-Focused Points

### Definitions to Memorize
* **Adjacency List:** एक array/hash table representation जहाँ प्रत्येक key $u$ के लिए, उसके direct neighbors की list stored होती है। Space requirements: $\Theta(V+E)$।
* **Graph Diameter:** Graph में किन्हीं भी दो vertices के बीच के shortest paths में से अधिकतम path length (worst-case shortest path)।
* **Frontier:** BFS में वर्तमान layer के उन nodes का set जिन्हें explore किया जा रहा है।

### Important Distinctions
* **Explicit vs. Implicit Representation:** Explicit representation पूरे graph को memory में store करता है। Implicit representation केवल current node और rules का उपयोग करके dynamically neighbors calculate करता है (massive state-space problems के लिए आवश्यक)।
* **Directed vs. Undirected Graph Complexity:** Sum of degrees undirected graphs में $2E$ होती है, जबकि directed graphs में $E$ होती है। दोनों मामलों में BFS की overall complexity $O(V+E)$ ही रहती है।

### BFS Time Complexity Proof (Exam-oriented Idea)
1. प्रत्येक reachable node `frontier` में अधिकतम एक बार ही आ सकता है, क्योंकि insert होते ही उसका `level` register हो जाता है।
2. जब कोई node $u$ frontier में आता है, तो हम उसके सभी neighbors (adjacency list) को exact एक बार scan करते हैं।
3. सभी adjacency lists का total sum $\Theta(E)$ होता है (Handshaking Lemma के अनुसार)।
4. सभी vertices को initialize करने में $O(V)$ का समय लगता है।
5. अतः total time complexity $O(V + E)$ है।

---

## Quick Revision
* **Graph:** Vertices ($V$) और Edges ($E$) का collection है। यह directed या undirected हो सकता है।
* **Adjacency List** का space $\Theta(V+E)$ होता है और यह neighbors खोजने के लिए edge list ($O(E)$) से बहुत बेहतर है।
* **Implicit Representation** में neighbors को function call द्वारा compute किया जाता है, जो Rubik's cube जैसे "infinite" या बहुत बड़े graphs के लिए useful है।
* **BFS (Breadth-First Search)** layer-by-layer (shortest paths first) explore करता है।
* **BFS की Time Complexity** $O(V+E)$ है।
* **Duplicate detection** के लिए `level` hash table का उपयोग किया जाता है।
* **Parent pointers** का उपयोग करके source $s$ से किसी भी reachable node $v$ तक का shortest path trace किया जा सकता है।
* 2x2x2 Pocket Cube का diameter **11** है और $n \times n \times n$ cube का diameter $\Theta(n^2 / \log n)$ है।