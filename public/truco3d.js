/**
 * Truco3D - Visualizador 3D Ragdoll Cômico de Boteco
 * Integrado ao Truco Paulista & Mineiro via Three.js
 */
(function(window) {
    'use strict';

    let scene, camera, renderer, container;
    let isInitialized = false;
    let isRunning = false;
    let animFrameId = null;

    let viewMode = localStorage.getItem('truco_view_mode') || '2d'; // '2d' | '3d'
    let currentPlayers = [];
    let myPlayerId = '';

    // Grupos e Objetos da Cena
    let tableGroup, roomGroup;
    let avatars = []; // [player0, player1, player2, player3]
    let activeCards = []; // cartas jogadas na mesa 3D
    let shockwaves = [];
    let tableProps = {}; // copo, lata, etc.

    // Física e Shake
    let cameraShake = 0;
    const cameraBasePos = { x: 0, y: 4.8, z: 5.6 };
    let mouseParallax = { x: 0, y: 0, targetX: 0, targetY: 0 };

    // Textura cache para cartas
    const cardTextureCache = new Map();

    // ─── Inicialização ────────────────────────────────────────────────────────
    function init(mountEl) {
        if (isInitialized || !mountEl) return;
        container = mountEl;

        if (typeof THREE === 'undefined') {
            console.error('Three.js não carregado!');
            return;
        }

        // Cena
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x0a100d, 0.045);

        // Câmera
        const aspect = container.clientWidth / container.clientHeight || 1;
        camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 100);
        camera.position.set(cameraBasePos.x, cameraBasePos.y, cameraBasePos.z);
        camera.lookAt(0, 0.35, 0);

        // Renderizador
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        // Iluminação de Boteco
        buildLighting();

        // Cenário (Mesa de Boteco, Chão e Enfeites)
        buildRoom();
        buildTable();
        buildTableProps();

        // 4 Avatares Ragdoll nos 4 cantos da mesa
        buildAvatars();

        // Eventos de Redimensionamento e Mouse
        window.addEventListener('resize', onWindowResize);
        container.addEventListener('mousemove', onMouseMove);

        isInitialized = true;
        applyViewModeUI();

        if (viewMode === '3d') {
            startLoop();
        }
    }

    function onMouseMove(e) {
        const rect = container.getBoundingClientRect();
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        mouseParallax.targetX = normX * 0.45;
        mouseParallax.targetY = normY * 0.25;
    }

    function onWindowResize() {
        if (!camera || !renderer || !container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width === 0 || height === 0) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    // ─── Iluminação de Boteco ─────────────────────────────────────────────────
    function buildLighting() {
        // Luz ambiente quente
        const ambientLight = new THREE.AmbientLight(0xffedd5, 0.65);
        scene.add(ambientLight);

        // Lâmpada pendente amarela clássica sobre a mesa
        const pendantLight = new THREE.PointLight(0xfff3c4, 2.2, 14, 1.2);
        pendantLight.position.set(0, 3.8, 0);
        pendantLight.castShadow = true;
        pendantLight.shadow.mapSize.width = 1024;
        pendantLight.shadow.mapSize.height = 1024;
        pendantLight.shadow.bias = -0.002;
        scene.add(pendantLight);

        // Cúpula da luminária pendente (visual)
        const lampShadeGeo = new THREE.ConeGeometry(0.55, 0.35, 24, 1, true);
        const lampShadeMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, side: THREE.DoubleSide });
        const lampShade = new THREE.Mesh(lampShadeGeo, lampShadeMat);
        lampShade.position.set(0, 3.9, 0);
        scene.add(lampShade);

        // Lâmpada incandescente brilhante dentro da cúpula
        const bulbGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(0, 3.75, 0);
        scene.add(bulb);

        // Fio até o teto
        const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 2.5, 8);
        const cordMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
        const cord = new THREE.Mesh(cordGeo, cordMat);
        cord.position.set(0, 5.15, 0);
        scene.add(cord);
    }

    // ─── Sala e Piso ──────────────────────────────────────────────────────────
    function buildRoom() {
        roomGroup = new THREE.Group();

        // Chão de ladrilho escuro de boteco
        const floorGeo = new THREE.PlaneGeometry(24, 24);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x171513,
            roughness: 0.85,
            metalness: 0.1
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.6;
        floor.receiveShadow = true;
        roomGroup.add(floor);

        scene.add(roomGroup);
    }

    // ─── Mesa de Boteco Redonda com Feltro ────────────────────────────────────
    function buildTable() {
        tableGroup = new THREE.Group();

        // Borda de madeira nobre
        const tableRimGeo = new THREE.CylinderGeometry(3.1, 3.1, 0.22, 48);
        const tableRimMat = new THREE.MeshStandardMaterial({
            color: 0x3d2010,
            roughness: 0.55,
            metalness: 0.15
        });
        const tableRim = new THREE.Mesh(tableRimGeo, tableRimMat);
        tableRim.position.y = 0;
        tableRim.receiveShadow = true;
        tableRim.castShadow = true;
        tableGroup.add(tableRim);

        // Tampo de Feltro Verde Escuro
        const feltGeo = new THREE.CylinderGeometry(2.9, 2.9, 0.23, 48);
        const feltMat = new THREE.MeshStandardMaterial({
            color: 0x09482b,
            roughness: 0.92,
            metalness: 0.05
        });
        const felt = new THREE.Mesh(feltGeo, feltMat);
        felt.position.y = 0.005;
        felt.receiveShadow = true;
        tableGroup.add(felt);

        // Aro dourado sutil no feltro
        const ringGeo = new THREE.RingGeometry(1.6, 1.63, 48);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
        const innerRing = new THREE.Mesh(ringGeo, ringMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.125;
        tableGroup.add(innerRing);

        // Pé central da mesa (aço preto clássico de bar)
        const legGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.5, 24);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.4, metalness: 0.8 });
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.y = -0.85;
        leg.castShadow = true;
        tableGroup.add(leg);

        // Base circular no chão
        const baseGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.06, 32);
        const base = new THREE.Mesh(baseGeo, legMat);
        base.position.y = -1.57;
        base.receiveShadow = true;
        tableGroup.add(base);

        scene.add(tableGroup);
    }

    // ─── Enfeites de Boteco (Copo Americano, Latinha & Cinzeiro) ───────────────
    function buildTableProps() {
        const propsGroup = new THREE.Group();

        // 1. Copo Americano com Cerveja
        const copoGroup = new THREE.Group();
        copoGroup.position.set(-1.45, 0.12, 0.9);

        // Vidro
        const glassGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.38, 18, 1, true);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transmission: 0.88,
            opacity: 1,
            transparent: true,
            roughness: 0.15,
            ior: 1.5
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.y = 0.19;
        copoGroup.add(glass);

        // Cerveja amarela dentro
        const beerGeo = new THREE.CylinderGeometry(0.138, 0.11, 0.28, 18);
        const beerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, transparent: true, opacity: 0.85 });
        const beer = new THREE.Mesh(beerGeo, beerMat);
        beer.position.y = 0.15;
        copoGroup.add(beer);

        // Espuma branca
        const foamGeo = new THREE.CylinderGeometry(0.142, 0.138, 0.06, 18);
        const foamMat = new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.9 });
        const foam = new THREE.Mesh(foamGeo, foamMat);
        foam.position.y = 0.31;
        copoGroup.add(foam);

        propsGroup.add(copoGroup);

        // 2. Lata de Cerveja Gelada (Amarela estilo boteco)
        const canGroup = new THREE.Group();
        canGroup.position.set(1.5, 0.12, 0.7);

        const canGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.44, 24);
        const canMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.7 });
        const canMesh = new THREE.Mesh(canGeo, canMat);
        canMesh.position.y = 0.22;
        canMesh.castShadow = true;
        canGroup.add(canMesh);

        // Borda prateada superior da lata
        const canRimGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24);
        const canRimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.9 });
        const canRim = new THREE.Mesh(canRimGeo, canRimMat);
        canRim.position.y = 0.44;
        canGroup.add(canRim);

        propsGroup.add(canGroup);

        // 3. Monte de Baralho na mesa (deck decorativo)
        const deckGeo = new THREE.BoxGeometry(0.65, 0.12, 0.95);
        const deckMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 });
        const deckMesh = new THREE.Mesh(deckGeo, deckMat);
        deckMesh.position.set(-0.95, 0.18, -0.7);
        deckMesh.rotation.y = -0.3;
        deckMesh.castShadow = true;
        propsGroup.add(deckMesh);

        scene.add(propsGroup);

        tableProps.copo = { group: copoGroup, baseY: 0.12, velY: 0, rotVel: 0 };
        tableProps.can  = { group: canGroup,  baseY: 0.12, velY: 0, rotVel: 0 };
    }

    // ─── Construção dos 4 Avatares Ragdoll de Boteco ───────────────────────────
    function buildAvatars() {
        avatars = [];

        // Posições dos 4 jogadores sentados ao redor da mesa:
        // 0: Local (Sul / Frente), 1: Direita (Leste), 2: Parceiro (Norte / Frente ao Local), 3: Esquerda (Oeste)
        const seatConfigs = [
            { id: 0, pos: new THREE.Vector3(0, -0.2, 3.65),  rotY: Math.PI,     team: 0, isLocal: true,  hat: 'cap' },
            { id: 1, pos: new THREE.Vector3(3.65, -0.2, 0),  rotY: Math.PI / 2, team: 1, isLocal: false, hat: 'mustache' },
            { id: 2, pos: new THREE.Vector3(0, -0.2, -3.65), rotY: 0,           team: 0, isLocal: false, hat: 'straw' },
            { id: 3, pos: new THREE.Vector3(-3.65, -0.2, 0), rotY: -Math.PI / 2,team: 1, isLocal: false, hat: 'shades' }
        ];

        seatConfigs.forEach((cfg) => {
            const avatar = createRagdollAvatar(cfg);
            scene.add(avatar.root);
            avatars.push(avatar);
        });
    }

    function createRagdollAvatar(cfg) {
        const root = new THREE.Group();
        root.position.copy(cfg.pos);
        root.rotation.y = cfg.rotY;

        // Cadeira amarela de plástico de boteco (ícone nacional)
        const chairGroup = new THREE.Group();
        chairGroup.position.set(0, -0.5, 0.45);

        // Assento de plástico amarelo
        const seatGeo = new THREE.BoxGeometry(0.9, 0.08, 0.85);
        const chairMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
        const chairSeat = new THREE.Mesh(seatGeo, chairMat);
        chairSeat.position.y = 0.45;
        chairGroup.add(chairSeat);

        // Encosto curvo
        const backGeo = new THREE.BoxGeometry(0.85, 0.75, 0.08);
        const chairBack = new THREE.Mesh(backGeo, chairMat);
        chairBack.position.set(0, 0.85, 0.38);
        chairBack.rotation.x = -0.12;
        chairGroup.add(chairBack);

        // 4 Pés prateados
        const legMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 });
        const legPositions = [
            [-0.38, 0.22, -0.35], [0.38, 0.22, -0.35],
            [-0.38, 0.22, 0.35],  [0.38, 0.22, 0.35]
        ];
        legPositions.forEach(lp => {
            const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.48, 8);
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lp[0], lp[1], lp[2]);
            chairGroup.add(leg);
        });
        root.add(chairGroup);

        // ── Corpo do Ragdoll ──
        const ragdollGroup = new THREE.Group();
        ragdollGroup.position.set(0, 0, 0);

        // Torso / Camiseta (Azul para Time A, Vermelho para Time B)
        const jerseyColor = (cfg.team === 0) ? 0x1d4ed8 : 0xb91c1c;
        const torsoGeo = new THREE.CylinderGeometry(0.42, 0.36, 0.85, 20);
        const torsoMat = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.65 });
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0.55;
        torso.castShadow = true;
        ragdollGroup.add(torso);

        // Pescoço
        const neckGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12);
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xf7caa0, roughness: 0.55 });
        const neck = new THREE.Mesh(neckGeo, skinMat);
        neck.position.y = 1.02;
        ragdollGroup.add(neck);

        // Cabeça Ragdoll (Esfera cômica gordinha articulada)
        const headPivot = new THREE.Group();
        headPivot.position.set(0, 1.15, 0);

        const headGeo = new THREE.SphereGeometry(0.38, 24, 24);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.position.set(0, 0.32, 0);
        headMesh.castShadow = true;
        headPivot.add(headMesh);

        // Olhos Expressivos
        const eyeWhiteGeo = new THREE.SphereGeometry(0.08, 14, 14);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo    = new THREE.SphereGeometry(0.045, 12, 12);
        const pupilMat    = new THREE.MeshBasicMaterial({ color: 0x0f172a });

        // Olho Esquerdo
        const eyeL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        eyeL.position.set(-0.13, 0.35, -0.32);
        const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
        pupilL.position.set(-0.13, 0.35, -0.37);
        headPivot.add(eyeL);
        headPivot.add(pupilL);

        // Olho Direito
        const eyeR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
        eyeR.position.set(0.13, 0.35, -0.32);
        const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
        pupilR.position.set(0.13, 0.35, -0.37);
        headPivot.add(eyeR);
        headPivot.add(pupilR);

        // Boca cômica
        const mouthGeo = new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7c2d12 });
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.position.set(0, 0.22, -0.35);
        mouth.rotation.x = Math.PI;
        headPivot.add(mouth);

        // Acessórios temáticos engraçados
        if (cfg.hat === 'cap') {
            // Boné virado pra trás
            const capGeo = new THREE.SphereGeometry(0.40, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2);
            const capMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.y = 0.34;
            headPivot.add(cap);

            const brimGeo = new THREE.BoxGeometry(0.35, 0.03, 0.26);
            const brim = new THREE.Mesh(brimGeo, capMat);
            brim.position.set(0, 0.38, 0.38);
            headPivot.add(brim);
        } else if (cfg.hat === 'mustache') {
            // Bigode farto de dono de bar
            const mustacheGeo = new THREE.BoxGeometry(0.32, 0.08, 0.08);
            const mustacheMat = new THREE.MeshStandardMaterial({ color: 0x271911, roughness: 0.9 });
            const mustache = new THREE.Mesh(mustacheGeo, mustacheMat);
            mustache.position.set(0, 0.26, -0.37);
            mustache.rotation.z = 0.08;
            headPivot.add(mustache);
        } else if (cfg.hat === 'straw') {
            // Chapéu de palha do caipira do truco
            const strawBrimGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.04, 24);
            const strawMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.95 });
            const strawBrim = new THREE.Mesh(strawBrimGeo, strawMat);
            strawBrim.position.y = 0.58;
            headPivot.add(strawBrim);

            const strawCrownGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.35, 20);
            const strawCrown = new THREE.Mesh(strawCrownGeo, strawMat);
            strawCrown.position.y = 0.75;
            headPivot.add(strawCrown);
        } else if (cfg.hat === 'shades') {
            // Óculos escuros estilo jogador blefador
            const shadesGeo = new THREE.BoxGeometry(0.42, 0.12, 0.05);
            const shadesMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2 });
            const shades = new THREE.Mesh(shadesGeo, shadesMat);
            shades.position.set(0, 0.35, -0.38);
            headPivot.add(shades);
        }

        ragdollGroup.add(headPivot);

        // ── Braços Moles (Ragdoll Arms) ──
        const armMat = new THREE.MeshStandardMaterial({ color: skinMat.color, roughness: 0.6 });

        // Braço Esquerdo
        const armLeftPivot = new THREE.Group();
        armLeftPivot.position.set(-0.46, 0.85, 0);
        const armLGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 12);
        const armL = new THREE.Mesh(armLGeo, armMat);
        armL.position.set(0, -0.28, -0.25);
        armL.rotation.x = -0.7;
        armLeftPivot.add(armL);
        ragdollGroup.add(armLeftPivot);

        // Braço Direito (Usado para a Pancada / Slam e Jogada de Cartas)
        const armRightPivot = new THREE.Group();
        armRightPivot.position.set(0.46, 0.85, 0);
        const armRGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 12);
        const armR = new THREE.Mesh(armRGeo, armMat);
        armR.position.set(0, -0.28, -0.25);
        armR.rotation.x = -0.7;
        armRightPivot.add(armR);

        // Mão direita gordinha
        const handGeo = new THREE.SphereGeometry(0.12, 14, 14);
        const handR = new THREE.Mesh(handGeo, skinMat);
        handR.position.set(0, -0.58, -0.45);
        armRightPivot.add(handR);

        ragdollGroup.add(armRightPivot);
        root.add(ragdollGroup);

        return {
            id: cfg.id,
            team: cfg.team,
            isLocal: cfg.isLocal,
            root,
            ragdollGroup,
            headPivot,
            eyeR,
            pupilR,
            armLeftPivot,
            armRightPivot,
            baseRotY: cfg.rotY,
            // Estado de animação física
            headSpring: { x: 0, z: 0, vx: 0, vz: 0 },
            bodyBob: Math.random() * 6.28,
            slamTimer: 0,
            trucoTimer: 0,
            signalTimer: 0
        };
    }

    // ─── Textura Dinâmica das Cartas 3D ───────────────────────────────────────
    function getCardTexture(card, isHidden = false, isManilha = false, manilhaLabel = '') {
        const cacheKey = isHidden ? 'hidden' : `${card.value}_${card.suit}_${isManilha}_${manilhaLabel}`;
        if (cardTextureCache.has(cacheKey)) {
            return cardTextureCache.get(cacheKey);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');

        if (isHidden) {
            // Verso da Carta: Azul nobre com losangos clássicos
            ctx.fillStyle = '#172554';
            ctx.fillRect(0, 0, 256, 360);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 10;
            ctx.strokeRect(10, 10, 236, 340);

            ctx.fillStyle = '#1e3a8a';
            for (let x = 30; x < 230; x += 36) {
                for (let y = 30; y < 330; y += 36) {
                    ctx.beginPath();
                    ctx.moveTo(x + 18, y);
                    ctx.lineTo(x + 36, y + 18);
                    ctx.lineTo(x + 18, y + 36);
                    ctx.lineTo(x, y + 18);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        } else {
            // Frente da Carta: Fundo branco de papel cartão
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 256, 360);

            // Borda interna
            ctx.strokeStyle = isManilha ? '#f59e0b' : '#cbd5e1';
            ctx.lineWidth = isManilha ? 8 : 4;
            ctx.strokeRect(10, 10, 236, 340);

            // Cores do Naipe
            const isRed = (card.suit === 'copas' || card.suit === 'ouros');
            const mainColor = isRed ? '#dc2626' : '#0f172a';
            const suitSymbols = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
            const symbol = suitSymbols[card.suit] || '♠';

            // Topo Esquerdo
            ctx.fillStyle = mainColor;
            ctx.font = 'bold 38px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(card.value, 24, 52);
            ctx.font = '32px serif';
            ctx.fillText(symbol, 25, 88);

            // Símbolo Central Grande
            ctx.font = '105px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(symbol, 128, 185);

            // Fundo Direito Invertido
            ctx.save();
            ctx.translate(232, 308);
            ctx.rotate(Math.PI);
            ctx.font = 'bold 38px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(card.value, 0, 0);
            ctx.font = '32px serif';
            ctx.fillText(symbol, 1, 36);
            ctx.restore();

            // Faixa Dourada se for Manilha
            if (isManilha) {
                ctx.fillStyle = '#b45309';
                ctx.fillRect(16, 16, 224, 28);
                ctx.fillStyle = '#ffffff';
                ctx.font = '900 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(manilhaLabel || 'MANILHA', 128, 30);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        cardTextureCache.set(cacheKey, texture);
        return texture;
    }

    // ─── Jogada de Carta 3D (Arremesso Físico na Mesa) ────────────────────────
    function onCardPlayed(data) {
        if (!isInitialized || viewMode !== '3d') return;

        // Identifica o avatar do jogador
        const myIndex = currentPlayers.findIndex(p => p.id === myPlayerId);
        const pIndex  = currentPlayers.findIndex(p => p.id === data.playerId);
        const is1v1   = currentPlayers.length === 2;
        let relativePos = 0;
        if (is1v1) {
            relativePos = (data.playerId === myPlayerId) ? 0 : 2;
        } else {
            relativePos = (pIndex - myIndex + 4) % 4;
        }

        const avatar = avatars[relativePos] || avatars[0];

        // Se foi pancada, aciona o braço do avatar imediatamente
        if (data.isSlam || data.isManilha) {
            onTableSlam(data.playerId);
        } else {
            // Movimento suave do braço jogando a carta
            avatar.armRightPivot.rotation.x = -1.2;
            setTimeout(() => { avatar.armRightPivot.rotation.x = -0.7; }, 260);
        }

        // Cria a carta 3D
        const cardGeo = new THREE.BoxGeometry(0.72, 0.015, 1.08);
        const frontMat = new THREE.MeshStandardMaterial({
            map: getCardTexture(data.card, data.card.hidden, data.isManilha),
            roughness: 0.4
        });
        const backMat  = new THREE.MeshStandardMaterial({
            map: getCardTexture(data.card, true),
            roughness: 0.5
        });
        const edgeMat  = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });

        const materials = [edgeMat, edgeMat, frontMat, backMat, edgeMat, edgeMat];
        const cardMesh = new THREE.Mesh(cardGeo, materials);
        cardMesh.castShadow = true;
        cardMesh.receiveShadow = true;

        // Ponto de início (mão do avatar)
        const startPos = new THREE.Vector3();
        avatar.armRightPivot.getWorldPosition(startPos);
        startPos.y += 0.2;
        cardMesh.position.copy(startPos);

        // Ponto de destino na mesa (centro com leve desvio aleatório)
        const angle = Math.random() * Math.PI * 2;
        const radius = 0.45 + Math.random() * 0.45;
        const targetX = Math.cos(angle) * radius;
        const targetZ = Math.sin(angle) * radius;
        const targetY = 0.125 + (activeCards.length * 0.018); // empilha levemente

        const targetRotY = (Math.random() - 0.5) * 1.5;

        scene.add(cardMesh);

        // Animação de trajetória parábola
        const animDuration = data.isSlam ? 240 : 380;
        const startTime = performance.now();

        const cardObj = {
            mesh: cardMesh,
            update: (now) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / animDuration, 1);
                const easeT = 1 - Math.pow(1 - progress, 2);

                cardMesh.position.x = THREE.MathUtils.lerp(startPos.x, targetX, easeT);
                cardMesh.position.z = THREE.MathUtils.lerp(startPos.z, targetZ, easeT);

                // Arco de parábola
                const arcHeight = (data.isSlam ? 0.6 : 1.3) * Math.sin(progress * Math.PI);
                cardMesh.position.y = THREE.MathUtils.lerp(startPos.y, targetY, easeT) + arcHeight;

                cardMesh.rotation.y = THREE.MathUtils.lerp(avatar.baseRotY, targetRotY, easeT);
                cardMesh.rotation.x = THREE.MathUtils.lerp(0.8, 0, easeT);
                cardMesh.rotation.z = Math.sin(progress * Math.PI) * 0.35;

                if (progress >= 1) {
                    cardMesh.position.set(targetX, targetY, targetZ);
                    cardMesh.rotation.set(0, targetRotY, 0);
                    return true; // concluído
                }
                return false;
            }
        };

        activeCards.push(cardObj);
    }

    // ─── Fim da Vaza (Recolhe as Cartas da Mesa) ──────────────────────────────
    function onTrickEnded() {
        if (!isInitialized || viewMode !== '3d') return;

        const cardsToCollect = [...activeCards];
        activeCards = [];

        const startTime = performance.now();
        const duration = 400;

        const collectAnim = () => {
            const now = performance.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            cardsToCollect.forEach(c => {
                c.mesh.position.y -= progress * 0.02;
                c.mesh.scale.multiplyScalar(0.92);
            });

            if (progress < 1) {
                requestAnimationFrame(collectAnim);
            } else {
                cardsToCollect.forEach(c => {
                    scene.remove(c.mesh);
                    if (c.mesh.geometry) c.mesh.geometry.dispose();
                });
            }
        };
        setTimeout(collectAnim, 280);
    }

    // ─── Tapa na Mesa (Pancada Ragdoll) ───────────────────────────────────────
    function onTableSlam(playerId) {
        if (!isInitialized || viewMode !== '3d') return;

        const myIndex = currentPlayers.findIndex(p => p.id === myPlayerId);
        const pIndex  = currentPlayers.findIndex(p => p.id === playerId);
        const is1v1   = currentPlayers.length === 2;
        let relativePos = 0;
        if (is1v1) {
            relativePos = (playerId === myPlayerId) ? 0 : 2;
        } else {
            relativePos = (pIndex - myIndex + 4) % 4;
        }

        const slapper = avatars[relativePos] || avatars[0];

        // 1. O avatar do tapa levanta o braço e bate com força
        slapper.armRightPivot.rotation.x = -1.8;
        setTimeout(() => {
            slapper.armRightPivot.rotation.x = -0.4;
            // Estalo e choque na mesa
            triggerSlamImpact(slapper);
        }, 120);

        setTimeout(() => {
            slapper.armRightPivot.rotation.x = -0.7;
        }, 360);
    }

    function triggerSlamImpact(slapper) {
        // Tremor da câmera 3D
        cameraShake = 0.22;

        // Efeito de onda de choque visual no feltro da mesa
        const shockGeo = new THREE.RingGeometry(0.15, 0.35, 32);
        const shockMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
        const shockMesh = new THREE.Mesh(shockGeo, shockMat);
        shockMesh.rotation.x = -Math.PI / 2;
        shockMesh.position.set(0, 0.13, 0);
        scene.add(shockMesh);

        const startTime = performance.now();
        shockwaves.push({
            mesh: shockMesh,
            update: (now) => {
                const elapsed = now - startTime;
                const p = Math.min(elapsed / 450, 1);
                shockMesh.scale.set(1 + p * 8.5, 1 + p * 8.5, 1);
                shockMat.opacity = 0.85 * (1 - p);
                if (p >= 1) {
                    scene.remove(shockMesh);
                    shockGeo.dispose();
                    shockMat.dispose();
                    return true;
                }
                return false;
            }
        });

        // Pulo dos copos e latinhas na mesa (física de impacto)
        if (tableProps.copo) {
            tableProps.copo.velY = 0.16;
            tableProps.copo.rotVel = 0.12;
        }
        if (tableProps.can) {
            tableProps.can.velY = 0.19;
            tableProps.can.rotVel = -0.15;
        }

        // Todos os avatares da mesa têm a cabeça empurrada pelo choque
        avatars.forEach(a => {
            a.headSpring.vx = (Math.random() - 0.5) * 0.25;
            a.headSpring.vz = -0.22;
        });
    }

    // ─── Grito de Truco (Reação Ragdoll Dramática) ─────────────────────────────
    function onTrucoRequested(val, answeringTeam, requestedBy) {
        if (!isInitialized || viewMode !== '3d') return;

        // O jogador que pediu se inclina agressivamente na mesa
        avatars.forEach(a => {
            if (a.team !== answeringTeam) {
                // Agressor: levanta os braços e joga o corpo pra frente
                a.ragdollGroup.position.z = 0.35;
                a.armLeftPivot.rotation.x = -1.6;
                a.armRightPivot.rotation.x = -1.6;
                a.headSpring.vz = -0.35;
                setTimeout(() => {
                    a.ragdollGroup.position.z = 0;
                    a.armLeftPivot.rotation.x = -0.7;
                    a.armRightPivot.rotation.x = -0.7;
                }, 1200);
            } else {
                // Quem recebe: se joga pra trás na cadeira com susto
                a.ragdollGroup.position.z = -0.3;
                a.headSpring.vz = 0.45;
                a.headSpring.vx = (Math.random() - 0.5) * 0.3;
                setTimeout(() => {
                    a.ragdollGroup.position.z = 0;
                }, 1200);
            }
        });

        cameraShake = 0.18;
    }

    // ─── Sinal Secreto (Piscada e Movimento Cômico) ────────────────────────────
    function onSecretSignal(playerId, signalId) {
        if (!isInitialized || viewMode !== '3d') return;

        const myIndex = currentPlayers.findIndex(p => p.id === myPlayerId);
        const pIndex  = currentPlayers.findIndex(p => p.id === playerId);
        const is1v1   = currentPlayers.length === 2;
        let relativePos = 0;
        if (is1v1) {
            relativePos = (playerId === myPlayerId) ? 0 : 2;
        } else {
            relativePos = (pIndex - myIndex + 4) % 4;
        }

        const avatar = avatars[relativePos];
        if (!avatar) return;

        // Inclina a cabeça com gesto de cumplicidade
        avatar.headPivot.rotation.z = 0.45;
        avatar.headPivot.rotation.x = -0.25;

        // Pisca o olho direito
        if (avatar.eyeR) avatar.eyeR.scale.y = 0.15;
        if (avatar.pupilR) avatar.pupilR.scale.y = 0.15;

        setTimeout(() => {
            avatar.headPivot.rotation.set(0, 0, 0);
            if (avatar.eyeR) avatar.eyeR.scale.y = 1;
            if (avatar.pupilR) avatar.pupilR.scale.y = 1;
        }, 1600);
    }

    // ─── Loop de Renderização e Física dos Ragdolls ───────────────────────────
    function startLoop() {
        if (isRunning) return;
        isRunning = true;

        const animate = (now) => {
            if (!isRunning) return;
            animFrameId = requestAnimationFrame(animate);

            // 1. Interpolação suave do mouse (Parallax)
            mouseParallax.x += (mouseParallax.targetX - mouseParallax.x) * 0.05;
            mouseParallax.y += (mouseParallax.targetY - mouseParallax.y) * 0.05;

            // 2. Camera Shake com decaimento exponencial
            let shakeX = 0, shakeY = 0;
            if (cameraShake > 0.001) {
                shakeX = (Math.random() - 0.5) * cameraShake;
                shakeY = (Math.random() - 0.5) * cameraShake;
                cameraShake *= 0.88;
            }

            camera.position.x = cameraBasePos.x + mouseParallax.x + shakeX;
            camera.position.y = cameraBasePos.y - mouseParallax.y + shakeY;
            camera.position.z = cameraBasePos.z;
            camera.lookAt(0, 0.35, 0);

            // 3. Atualiza cartas em voo
            for (let i = activeCards.length - 1; i >= 0; i--) {
                const isDone = activeCards[i].update(now);
                if (isDone) {
                    activeCards.splice(i, 1);
                }
            }

            // 4. Atualiza ondas de choque
            for (let i = shockwaves.length - 1; i >= 0; i--) {
                const isDone = shockwaves[i].update(now);
                if (isDone) {
                    shockwaves.splice(i, 1);
                }
            }

            // 5. Física de quique dos objetos da mesa (copo e lata)
            Object.values(tableProps).forEach(prop => {
                if (prop.velY !== 0 || prop.group.position.y > prop.baseY) {
                    prop.group.position.y += prop.velY;
                    prop.velY -= 0.015; // gravidade
                    if (prop.group.position.y <= prop.baseY) {
                        prop.group.position.y = prop.baseY;
                        prop.velY = -prop.velY * 0.42; // quique amortecido
                        if (Math.abs(prop.velY) < 0.01) prop.velY = 0;
                    }
                    prop.group.rotation.z += prop.rotVel;
                    prop.rotVel *= 0.86;
                }
            });

            // 6. Física e Wiggle dos Avatares Ragdoll
            const time = now * 0.003;
            avatars.forEach((a, idx) => {
                // Respiração suave do corpo
                const breath = Math.sin(time + idx * 1.5) * 0.018;
                a.ragdollGroup.position.y = breath;

                // Mola da cabeça (Spring Physics)
                const springK = 0.15;
                const damp = 0.82;
                a.headSpring.vx += (-a.headSpring.x) * springK;
                a.headSpring.vz += (-a.headSpring.z) * springK;
                a.headSpring.vx *= damp;
                a.headSpring.vz *= damp;
                a.headSpring.x += a.headSpring.vx;
                a.headSpring.z += a.headSpring.vz;

                // Wiggle da cabeça
                if (a.signalTimer <= 0) {
                    const idleWiggle = Math.sin(time * 0.7 + idx) * 0.04;
                    a.headPivot.rotation.y = idleWiggle + a.headSpring.x;
                    a.headPivot.rotation.x = a.headSpring.z;
                }
            });

            renderer.render(scene, camera);
        };

        animFrameId = requestAnimationFrame(animate);
    }

    function stopLoop() {
        isRunning = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    // ─── Alternância de Modos 2D / 3D ─────────────────────────────────────────
    function setMode(mode) {
        viewMode = (mode === '3d') ? '3d' : '2d';
        localStorage.setItem('truco_view_mode', viewMode);
        applyViewModeUI();
    }

    function toggleMode() {
        setMode(viewMode === '2d' ? '3d' : '2d');
    }

    function applyViewModeUI() {
        const c3d = document.getElementById('canvas-3d-container');
        const btnToggle = document.getElementById('btn-toggle-view-mode');
        const iconToggle = document.getElementById('icon-view-mode');
        const textToggle = document.getElementById('text-view-mode');
        const tableArea = document.getElementById('table-area');

        if (viewMode === '3d') {
            if (c3d) c3d.classList.remove('hidden');
            if (iconToggle) iconToggle.className = 'ph ph-cards text-base';
            if (textToggle) textToggle.textContent = '2D Clássico';
            if (btnToggle) {
                btnToggle.classList.remove('text-emerald-400');
                btnToggle.classList.add('text-amber-400');
                btnToggle.title = 'Alternar para visão 2D Clássica';
            }
            if (tableArea) {
                tableArea.classList.add('mode-3d-overlay');
            }
            startLoop();
            onWindowResize();
        } else {
            if (c3d) c3d.classList.add('hidden');
            if (iconToggle) iconToggle.className = 'ph ph-cube text-base';
            if (textToggle) textToggle.textContent = '3D Ragdoll';
            if (btnToggle) {
                btnToggle.classList.remove('text-amber-400');
                btnToggle.classList.add('text-emerald-400');
                btnToggle.title = 'Alternar para visão 3D Ragdoll de Boteco';
            }
            if (tableArea) {
                tableArea.classList.remove('mode-3d-overlay');
            }
            stopLoop();
        }
    }

    function updatePlayers(players, localId) {
        currentPlayers = players || [];
        myPlayerId = localId || myPlayerId;
    }

    function clearTable() {
        activeCards.forEach(c => {
            scene.remove(c.mesh);
            if (c.mesh.geometry) c.mesh.geometry.dispose();
        });
        activeCards = [];
    }

    // Exportação da API Pública
    window.Truco3D = {
        init,
        setMode,
        toggleMode,
        getMode: () => viewMode,
        onCardPlayed,
        onTrickEnded,
        onTableSlam,
        onTrucoRequested,
        onSecretSignal,
        updatePlayers,
        clearTable
    };

})(window);
