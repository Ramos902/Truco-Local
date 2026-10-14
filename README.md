# 🃏 Truco Local - Edição Raiz de Boteco (2D & 3D Ragdoll)

Jogo de Truco brasileiro completo para jogar localmente ou em rede (multiplayer via WebSockets), trazendo a atmosfera autêntica de boteco com dois modos visuais alternáveis em tempo real: **2D Clássico Tátil** e **3D Ragdoll Cômico com Órbita Livre 360°**.

---

## 📌 Visão Geral do Projeto

* **Backend:** Node.js + Express + Socket.IO (arquitetura cliente-servidor autoritativa).
* **Frontend:** Vanilla JavaScript + Tailwind CSS (via CDN) + Phosphor Icons.
* **Motor 3D:** Three.js (carregado via CDN, sem bundlers pesados, 100% nativo).
* **Áudio:** Web Audio API sintético procedural com SoundFX customizado (sem depender de arquivos externos de áudio).
* **Design:** Estética "Anti-AI" com botões táteis tridimensionais, feltro de mesa clássico e humor nacional.

---

## 🎴 Regras e Modos Suportados

1. **Variantes de Truco:**
   * **Truco Paulista:** Manilha nova determinada pela carta virada (Vira). Ex: Vira 2 $\rightarrow$ Manilha 4.
   * **Truco Mineiro:** Manilhas fixas imutáveis (4 de Paus / Zap, 7 de Copas, Espadilha, 7 de Ouros / Pica-fumo).
2. **Formatos de Mesa:**
   * **1 contra 1 (Mano a Mano):** Partida rápida entre dois jogadores.
   * **2 contra 2 (Duplas):** Formato clássico em cruz (Você & Parceiro vs Adversários).
3. **Mecânicas Especiais:**
   * **Aumentos de Aposta:** Truco (3) $\rightarrow$ Seis (6) $\rightarrow$ Nove (9) $\rightarrow$ Doze (12).
   * **Votação em Dupla:** Ambos os jogadores precisam concordar para correr do Truco ou aceitar.
   * **Mão de 11 / Mão de Ferro:** Visualização das cartas da dupla sem sinais antes de aceitar.
   * **Carta Escondida (Escuridão):** Possibilidade de jogar a carta virada para baixo no blefe.
   * **Empate de Vaza (Canga):** Regra tradicional brasileira (primeira empata $\rightarrow$ maior na segunda vence).
   * **Sinais Secretos de Dupla:** Piscar olho (Zap), Biquinho (7 Copas), Erguer Sobrancelha (Espadilha), Coçar Nariz (7 Ouros), Bocejar ("Tô Liso").
   * **Estatísticas da Partida & MVP:** Destaque de quem mais fez vazas decisivas e venceu trucos.

---

## 🎭 O Visualizador 3D Ragdoll de Boteco (`public/truco3d.js`)

O visualizador 3D roda simultaneamente ao jogo e pode ser ativado/desativado a qualquer momento pelo botão **3D Ragdoll / 2D Clássico**:

* **Câmera de Órbita Livre 360° & Zoom:**
  * Arraste com o botão direito (ou botão esquerdo no fundo) para girar ao redor da mesa.
  * Scroll do mouse ou gesto de pinça no touch para zoom in / out suave.
  * Botão flutuante **Resetar Câmera** (`#btn-reset-cam`) e atalho de clique duplo para retornar à visão frontal.
  * Efeito de *punch-in zoom* cinemático nos aumentos de aposta.
* **Avatares Ragdoll com Rigging Cômico:**
  * 4 jogadores de boteco sentados em cadeiras de plástico amarelas (com boné, bigodão, chapéu de palha e óculos escuros).
  * Braços e cabeças com física elástica (*spring physics*) e pernas com chinelos de dedo (Havaianas).
* **Animações de Humor Raiz:**
  * **Queda da Cadeira:** Ao correr do Truco, o boneco tomba para trás com cadeira e tudo, esparramando-se no chão em pose de derrota.
  * **Subir na Mesa:** Ao pedir Truco/Seis/Nove/Doze, o desafiante sobe na borda da mesa, balança os braços no ar e desafia os oponentes.
  * **Desmaio do Bocejo ("Tô Liso"):** Ao enviar o sinal de bocejo, o boneco bate a cabeça no feltro verde e solta nuvens flutuantes de `"Zzz..."`.
  * **Pancada na Mesa & Espuma de Cerveja:** Copo americano canelado e latinha amarela pulam com a pancada, espirrando gotas de cerveja e espuma.
  * **Onomatopeias em Quadrinhos 3D:** Pop-ups elásticos em estilo gibi (`"POW!"`, `"ZAP!"`, `"TOMA!"`, `"TRUUUCO!"`, `"CHORA!"`).
  * **Dança da Vitória:** Pulos e festa na tela de fim de jogo.
* **Otimização Extrema (60 FPS em PCs Fracos / Low-End):**
  * `pixelRatio` travado em no máximo 1.25 para poupar GPUs integradas (Intel UHD / Iris / Vega).
  * Sombra única com mapa de profundidade 512x512.
  * Pools pré-alocados de partículas e sprites (Zero Garbage Collection / sem micro-travamentos).
  * Pausa automática do loop Three.js quando a aba estiver em segundo plano ou no modo 2D.
  * Cartas pousam com offset seguro e `polygonOffset` ativo para erradicar Z-fighting.

---

## 📁 Estrutura de Arquivos

```
Truco-Local/
│
├── server.js              # Servidor Node.js (Socket.IO, salas, baralho, manilhas e regras)
├── package.json           # Dependências e scripts (express, socket.io)
├── README.md              # Documentação completa e guia de continuação
│
└── public/
    ├── index.html         # Interface do usuário (lobby, mesa 2D, modais, overlay 3D)
    ├── client.js          # Lógica do cliente (eventos de rede, áudio, UI 2D, integrações)
    └── truco3d.js         # Motor 3D Three.js (cenário boteco, ragdolls, câmera órbita, física)
```

---

## 🚀 Como Executar o Projeto

1. **Instalar Dependências:**
   ```bash
   npm install
   ```

2. **Iniciar o Servidor:**
   ```bash
   npm start
   # ou
   node server.js
   ```

3. **Acessar no Navegador:**
   Abra `http://localhost:3000`.

4. **Multiplayer Local / Rede:**
   * Para testar sozinho: abra 2 abas (1v1) ou 4 abas (2v2) e entre na mesma sala.
   * Para jogar com amigos na mesma rede Wi-Fi: use o IP local da máquina (ex: `http://192.168.1.100:3000`).

---

## 🛠️ Detalhes das Correções Recentes

* **Glitch Visual das Cartas na Mesa:**
  * *3D:* Eliminado o Z-fighting com elevação de pouso para $Y = 0.134$ ($+0.012$ por carta sobreposta), aro em $0.121$, feltro com `polygonOffsetFactor: 1` e cartas com `polygonOffsetFactor: -1`.
  * *2D:* A reconciliação do `updateState` agora é inteligente e não destrutiva (`tableCardsContainer` não é mais zerado com `innerHTML = ''` no meio de animações), mantendo chaves fixas `data-card-key` e rotação determinística baseada no hash da carta para evitar tremores e piscas.
* **Câmera de Órbita Livre:** Rotação completa 360°, controle de elevação seguro para não passar do chão, scroll para zoom, botão flutuante `#btn-reset-cam` e atalho de clique duplo.
* **Humor Ragdoll:** Queda de cadeira amarela ao fugir do truco, desafio subindo na mesa, cabeçada no feltro e nuvens de sono "Zzz...", gotas e espumas de cerveja realistas.

---

## 💡 Próximas Features e Melhorias (Backlog para a Próxima Sessão)

Quando retomar o desenvolvimento em uma nova sessão, aqui estão as opções planejadas prontas para implementação:

1. **🩴 Guerra de Objetos de Boteco (Arremesso Físico nos Jogadores):**
   * **Havaiana Voadora:** Clicar no adversário para tacar o chinelo rodando no peito/cabeça dele (*"PLOF!"*). O boneco cambaleia e fica descalço temporariamente.
   * **Bolinha de Guardanapo / Copo Amassado:** Atirar no jogador demorado da mesa ("Joga logo!").
   * **Pedrinha de Gelo / Amendoim:** Atirar petelecos de amendoim ou pedrinha de gelo gelada.
2. **🍻 Interações Físicas de Mesa:**
   * **Brinde de Copos:** Clicar no copo americano ou no parceiro para brindar com som de vidro e espuma.
   * **Batuque de Latinha:** Batidinhas de latinha na mesa para botar pressão psicológica na rodada.
   * **Chamar o Garçom:** Emote para estalar os dedos pro alto: *"Ô garçom, desce mais uma!"*.
3. **🐔 Provocações e Danças:**
   * **Gesto da Galinha:** Bater asas de frango quando a equipe adversária corre do truco.
   * **Dança do Ombrinho:** Comemoração na cadeira de plástico ao matar a vaza com manilha maior.
4. **📢 Soundboard de Vozes de Truqueiro:**
   * Mini menu de falas clássicas de boteco (*"Aqui é ferro puro!"*, *"Chora bebê!"*, *"Corta a mão dele que é manilha!"*).

---

## 🤖 Guia Rápido para a IA / Desenvolvedor na Próxima Sessão

Se você é uma IA ou desenvolvedor continuando este projeto em uma nova conversa:
1. O repositório está no branch `main` e sincronizado com o GitHub (`https://github.com/Ramos902/Truco-Local.git`).
2. O código de física 3D e animações ragdoll fica encapsulado em [`public/truco3d.js`](file:///C:/Users/54851931hlob/Documents/Truco-Local-main/Truco-Local-main/public/truco3d.js) sob o objeto global `window.Truco3D`.
3. Os eventos do Socket.IO e UI 2D ficam em [`public/client.js`](file:///C:/Users/54851931hlob/Documents/Truco-Local-main/Truco-Local-main/public/client.js) e as regras do servidor em [`server.js`](file:///C:/Users/54851931hlob/Documents/Truco-Local-main/Truco-Local-main/server.js).
4. Para testar comandos no terminal deste ambiente Windows, use sempre:
   ```powershell
   & "C:\Program Files\Git\cmd\git.exe" <comando>
   node -c <arquivo.js>
   ```
