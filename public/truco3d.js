/**
 * Truco3D - Visualizador 3D Ragdoll Cômico de Boteco & Câmera de Órbita Livre
 * Otimizado para 60 FPS constantes em computadores fracos (Low-End PC Friendly)
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

    // ─── Grupos e Objetos da Cena ─────────────────────────────────────────────
    let tableGroup, roomGroup;
    let avatars = []; // [player0, player1, player2, player3]
    let activeCards = [];
    let shockwaves = [];
    let tableProps = {};

    // ─── Câmera com Órbita Livre 360° & Zoom ──────────────────────────────────
    // Posição base padrão (Sul, visão do jogador local)
    const CAMERA_DEFAULT = {
        radius: 7.4,
        theta: 0,           // Rotação horizontal (azimuth)
        phi: 0.86,          // Inclinação vertical (polar) ~49° acima da mesa
        lookAtY: 0.45
    };

    const cameraOrbit = {
        currentRadius: CAMERA_DEFAULT.radius,
        targetRadius:  CAMERA_DEFAULT.radius,
        currentTheta:  CAMERA_DEFAULT.theta,
        targetTheta:   CAMERA_DEFAULT.theta,
        currentPhi:    CAMERA_DEFAULT.phi,
        targetPhi:     CAMERA_DEFAULT.phi,
        lookAt: new THREE.Vector3(0, CAMERA_DEFAULT.lookAtY, 0),
        targetLookAt: new THREE.Vector3(0, CAMERA_DEFAULT.lookAtY, 0)
    };

    let cameraShake = 0;
    let isPointerDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let touchStartDist = 0;

    // Scratch Math Objects (Pre-alocados para ZERO Garbage Collection nos 60 FPS)
    const _scratchVec1 = new THREE.Vector3();
    const _scratchVec2 = new THREE.Vector3();

    // ─── Caches de Texturas ───────────────────────────────────────────────────
    const cardTextureCache = new Map();
    const comicTextureCache = new Map();

    // ─── Pools de Partículas e Sprites (Sem Alocações no Loop) ────────────────
    const MAX_SPLASH_DROPS = 32;
    let splashDropsPool = [];

    const MAX_COMIC_SPRITES = 8;
    let comicSpritesPool = [];

    const MAX_ZZZ_SPRITES = 8;
    let zzzSpritesPool = [];

    // ─── Inicialização do Visualizador ────────────────────────────────────────
    function init(mountEl) {
        if (isInitialized || !mountEl) return;
        container = mountEl;

        if (typeof THREE === 'undefined') {
            console.error('Three.js não carregado!');
            return;
        }

        // 1. Cena
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x0a100d, 0.04);

        // 2. Câmera Perspectiva
        const aspect = container.clientWidth / container.clientHeight || 1;
        camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 80);
        updateCameraTransform();

        // 3. Renderizador WebGL Ultraleve (Cravado em 60 FPS para PCs fracos)
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(container.clientWidth, container.clientHeight);
        // Trava pixelRatio em no máximo 1.25 para não estrangular placas de vídeo integradas (Intel UHD / Iris)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        // 4. Montagem do Cenário e Boteco
        buildLighting();
        buildRoom();
        buildTable();
        buildTableProps();

        // 5. Avatares Ragdoll com Rigging Cômico
        buildAvatars();

        // 6. Pre-aquecimento dos Pools de Partículas (Zero GC)
        initParticlePools();

        // 7. Eventos de Janela, Câmera e Mouse
        window.addEventListener('resize', onWindowResize);
        setupOrbitControls();

        // Pausa loop quando aba estiver oculta para economizar bateria e CPU
        document.addEventListener('visibilitychange', onVisibilityChange);

        isInitialized = true;
        applyViewModeUI();

        if (viewMode === '3d') {
            startLoop();
        }
    }

    function onVisibilityChange() {
        if (document.hidden) {
            stopLoop();
        } else if (viewMode === '3d') {
            startLoop();
        }
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

    // ─── Controles de Câmera de Órbita Livre 360° ─────────────────────────────
    function setupOrbitControls() {
        if (!container) return;

        // Mouse Drag / Pointer
        container.addEventListener('pointerdown', (e) => {
            // Ignora se clicou em botão ou elemento interativo sobreposto
            if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('#my-cards') || e.target.closest('.pointer-events-auto:not(#canvas-3d-container)'))) {
                return;
            }
            isPointerDown = true;
            pointerStartX = e.clientX;
            pointerStartY = e.clientY;
            lastPointerX = e.clientX;
            lastPointerY = e.clientY;
            container.style.cursor = 'grabbing';
        });

        window.addEventListener('pointermove', (e) => {
            if (!isPointerDown) return;
            const dx = e.clientX - lastPointerX;
            const dy = e.clientY - lastPointerY;
            lastPointerX = e.clientX;
            lastPointerY = e.clientY;

            // Rotação horizontal (Azimuth)
            cameraOrbit.targetTheta -= dx * 0.0065;

            // Inclinação vertical (Polar / Elevação) - Clamped para nunca virar de ponta cabeça nem entrar no chão
            cameraOrbit.targetPhi = Math.max(0.18, Math.min(1.42, cameraOrbit.targetPhi - dy * 0.0055));
        });

        window.addEventListener('pointerup', () => {
            if (isPointerDown) {
                isPointerDown = false;
                if (container) container.style.cursor = 'default';
            }
        });

        window.addEventListener('pointercancel', () => {
            isPointerDown = false;
            if (container) container.style.cursor = 'default';
        });

        // Zoom com Scroll Wheel
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY * 0.004;
            cameraOrbit.targetRadius = Math.max(3.5, Math.min(9.5, cameraOrbit.targetRadius + zoomDelta));
        }, { passive: false });

        // Touch Pinch Zoom no Mobile
        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                touchStartDist = Math.hypot(dx, dy);
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && touchStartDist > 0) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const diff = (touchStartDist - dist) * 0.01;
                cameraOrbit.targetRadius = Math.max(3.5, Math.min(9.5, cameraOrbit.targetRadius + diff));
                touchStartDist = dist;
            }
        }, { passive: true });

        // Previne menu de contexto ao arrastar com botão direito
        container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Duplo clique redefine câmera
        container.addEventListener('dblclick', () => {
            resetCamera();
        });
    }

    function resetCamera() {
        cameraOrbit.targetRadius = CAMERA_DEFAULT.radius;
        cameraOrbit.targetTheta  = CAMERA_DEFAULT.theta;
        cameraOrbit.targetPhi    = CAMERA_DEFAULT.phi;
        cameraOrbit.targetLookAt.set(0, CAMERA_DEFAULT.lookAtY, 0);
    }

    function updateCameraTransform() {
        if (!camera) return;

        // Interpolação suave (Damping)
        cameraOrbit.currentRadius += (cameraOrbit.targetRadius - cameraOrbit.currentRadius) * 0.12;
        cameraOrbit.currentTheta  += (cameraOrbit.targetTheta - cameraOrbit.currentTheta) * 0.12;
        cameraOrbit.currentPhi    += (cameraOrbit.targetPhi - cameraOrbit.currentPhi) * 0.12;
        cameraOrbit.lookAt.lerp(cameraOrbit.targetLookAt, 0.12);

        // Tremores de câmera (Screen Shake com decaimento exponencial)
        let shakeX = 0, shakeY = 0, shakeZ = 0;
        if (cameraShake > 0.001) {
            shakeX = (Math.random() - 0.5) * cameraShake;
            shakeY = (Math.random() - 0.5) * cameraShake;
            shakeZ = (Math.random() - 0.5) * cameraShake;
            cameraShake *= 0.86;
        }

        // Conversão de coordenadas esféricas para cartesianas
        const sinPhi = Math.sin(cameraOrbit.currentPhi);
        const cosPhi = Math.cos(cameraOrbit.currentPhi);
        const sinTheta = Math.sin(cameraOrbit.currentTheta);
        const cosTheta = Math.cos(cameraOrbit.currentTheta);

        camera.position.set(
            cameraOrbit.lookAt.x + cameraOrbit.currentRadius * sinPhi * sinTheta + shakeX,
            cameraOrbit.lookAt.y + cameraOrbit.currentRadius * cosPhi + shakeY,
            cameraOrbit.lookAt.z + cameraOrbit.currentRadius * sinPhi * cosTheta + shakeZ
        );

        camera.lookAt(cameraOrbit.lookAt.x, cameraOrbit.lookAt.y, cameraOrbit.lookAt.z);
    }

    // ─── Iluminação de Boteco ─────────────────────────────────────────────────
    function buildLighting() {
        // Luz ambiente quente e acolhedora de botequim
        const ambientLight = new THREE.AmbientLight(0xffedd5, 0.75);
        scene.add(ambientLight);

        // Lâmpada pendente amarela central (única fonte de sombra para garantir 60 FPS)
        const pendantLight = new THREE.PointLight(0xfff3c4, 2.0, 15, 1.2);
        pendantLight.position.set(0, 3.8, 0);
        pendantLight.castShadow = true;
        pendantLight.shadow.mapSize.width = 512;  // Otimizado: 512x512 para performance fluida
        pendantLight.shadow.mapSize.height = 512;
        pendantLight.shadow.bias = -0.003;
        scene.add(pendantLight);

        // Cúpula da luminária pendente de alumínio preto
        const lampShadeGeo = new THREE.ConeGeometry(0.55, 0.35, 20, 1, true);
        const lampShadeMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, side: THREE.DoubleSide });
        const lampShade = new THREE.Mesh(lampShadeGeo, lampShadeMat);
        lampShade.position.set(0, 3.9, 0);
        scene.add(lampShade);

        // Lâmpada incandescente visível
        const bulbGeo = new THREE.SphereGeometry(0.11, 14, 14);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(0, 3.75, 0);
        scene.add(bulb);

        // Fio até o teto
        const cordGeo = new THREE.CylinderGeometry(0.012, 0.012, 2.5, 6);
        const cordMat = new THREE.MeshBasicMaterial({ color: 0x111827 });
        const cord = new THREE.Mesh(cordGeo, cordMat);
        cord.position.set(0, 5.15, 0);
        scene.add(cord);
    }

    // ─── Sala e Piso ──────────────────────────────────────────────────────────
    function buildRoom() {
        roomGroup = new THREE.Group();

        // Chão de ladrilho hidráulico escuro de boteco
        const floorGeo = new THREE.PlaneGeometry(24, 24);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x171513,
            roughness: 0.88,
            metalness: 0.08
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

        // Borda de madeira
        const tableRimGeo = new THREE.CylinderGeometry(3.1, 3.1, 0.22, 36);
        const tableRimMat = new THREE.MeshStandardMaterial({
            color: 0x3d2010,
            roughness: 0.6,
            metalness: 0.12
        });
        const tableRim = new THREE.Mesh(tableRimGeo, tableRimMat);
        tableRim.position.y = 0;
        tableRim.receiveShadow = true;
        tableRim.castShadow = true;
        tableGroup.add(tableRim);

        // Tampo de Feltro Verde Escuro
        const feltGeo = new THREE.CylinderGeometry(2.9, 2.9, 0.23, 36);
        const feltMat = new THREE.MeshStandardMaterial({
            color: 0x09482b,
            roughness: 0.94,
            metalness: 0.04
        });
        const felt = new THREE.Mesh(feltGeo, feltMat);
        felt.position.y = 0.005;
        felt.receiveShadow = true;
        tableGroup.add(felt);

        // Aro dourado sutil no feltro
        const ringGeo = new THREE.RingGeometry(1.6, 1.63, 36);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
        const innerRing = new THREE.Mesh(ringGeo, ringMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.125;
        tableGroup.add(innerRing);

        // Pé central da mesa de ferro fundido
        const legGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.5, 18);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.5, metalness: 0.7 });
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.y = -0.85;
        leg.castShadow = true;
        tableGroup.add(leg);

        // Base circular no chão
        const baseGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.06, 24);
        const base = new THREE.Mesh(baseGeo, legMat);
        base.position.y = -1.57;
        base.receiveShadow = true;
        tableGroup.add(base);

        scene.add(tableGroup);
    }

    // ─── Enfeites de Boteco (Copo Americano, Latinha & Baralho) ───────────────
    function buildTableProps() {
        const propsGroup = new THREE.Group();

        // 1. Copo Americano com Cerveja Gelada
        const copoGroup = new THREE.Group();
        copoGroup.position.set(-1.45, 0.12, 0.9);

        // Vidro canelado
        const glassGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.38, 16, 1, true);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transmission: 0.85,
            opacity: 1,
            transparent: true,
            roughness: 0.15,
            ior: 1.45
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.y = 0.19;
        copoGroup.add(glass);

        // Cerveja dourada
        const beerGeo = new THREE.CylinderGeometry(0.138, 0.11, 0.28, 16);
        const beerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, transparent: true, opacity: 0.85 });
        const beer = new THREE.Mesh(beerGeo, beerMat);
        beer.position.y = 0.15;
        copoGroup.add(beer);

        // Espuma cremosa
        const foamGeo = new THREE.CylinderGeometry(0.142, 0.138, 0.06, 16);
        const foamMat = new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: 0.9 });
        const foam = new THREE.Mesh(foamGeo, foamMat);
        foam.position.y = 0.31;
        copoGroup.add(foam);

        propsGroup.add(copoGroup);

        // 2. Lata de Cerveja Amarela de Boteco
        const canGroup = new THREE.Group();
        canGroup.position.set(1.5, 0.12, 0.7);

        const canGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.44, 20);
        const canMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.35, metalness: 0.7 });
        const canMesh = new THREE.Mesh(canGeo, canMat);
        canMesh.position.y = 0.22;
        canMesh.castShadow = true;
        canGroup.add(canMesh);

        // Borda prateada
        const canRimGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 20);
        const canRimMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.2, metalness: 0.9 });
        const canRim = new THREE.Mesh(canRimGeo, canRimMat);
        canRim.position.y = 0.44;
        canGroup.add(canRim);

        propsGroup.add(canGroup);

        // 3. Monte do Baralho decorativo na mesa
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

    // ─── Avatares Ragdoll Cômicos de Boteco ────────────────────────────────────
    function buildAvatars() {
        avatars = [];

        // 4 Posições: 0: Sul (Local), 1: Leste (Direita), 2: Norte (Parceiro), 3: Oeste (Esquerda)
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

        // ── 1. Cadeira Amarela de Plástico de Boteco (Tombável) ──
        const chairGroup = new THREE.Group();
        chairGroup.position.set(0, -0.5, 0.45);

        // Assento
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

        // 4 Pés da cadeira
        const legMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 });
        const legPositions = [
            [-0.38, 0.22, -0.35], [0.38, 0.22, -0.35],
            [-0.38, 0.22, 0.35],  [0.38, 0.22, 0.35]
        ];
        legPositions.forEach(lp => {
            const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.48, 6);
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lp[0], lp[1], lp[2]);
            chairGroup.add(leg);
        });
        root.add(chairGroup);

        // ── 2. Corpo do Ragdoll ──
        const ragdollGroup = new THREE.Group();
        ragdollGroup.position.set(0, 0, 0);

        // Torso / Camiseta (Azul: Time 0 / Vermelho: Time 1)
        const jerseyColor = (cfg.team === 0) ? 0x1d4ed8 : 0xb91c1c;
        const torsoGeo = new THREE.CylinderGeometry(0.42, 0.36, 0.85, 16);
        const torsoMat = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.65 });
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0.55;
        torso.castShadow = true;
        ragdollGroup.add(torso);

        // Pescoço
        const neckGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.18, 10);
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xf7caa0, roughness: 0.55 });
        const neck = new THREE.Mesh(neckGeo, skinMat);
        neck.position.y = 1.02;
        ragdollGroup.add(neck);

        // Cabeça Articulada (Head Pivot com Spring Physics)
        const headPivot = new THREE.Group();
        headPivot.position.set(0, 1.15, 0);

        const headGeo = new THREE.SphereGeometry(0.38, 18, 18);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.position.set(0, 0.32, 0);
        headMesh.castShadow = true;
        headPivot.add(headMesh);

        // Olhos Expressivos
        const eyeWhiteGeo = new THREE.SphereGeometry(0.08, 12, 12);
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo    = new THREE.SphereGeometry(0.045, 10, 10);
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

        // Boca Cômica
        const mouthGeo = new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7c2d12 });
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.position.set(0, 0.22, -0.35);
        mouth.rotation.x = Math.PI;
        headPivot.add(mouth);

        // Acessórios Temáticos
        if (cfg.hat === 'cap') {
            const capGeo = new THREE.SphereGeometry(0.40, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
            const capMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.y = 0.34;
            headPivot.add(cap);

            const brimGeo = new THREE.BoxGeometry(0.35, 0.03, 0.26);
            const brim = new THREE.Mesh(brimGeo, capMat);
            brim.position.set(0, 0.38, 0.38);
            headPivot.add(brim);
        } else if (cfg.hat === 'mustache') {
            const mustacheGeo = new THREE.BoxGeometry(0.32, 0.08, 0.08);
            const mustacheMat = new THREE.MeshStandardMaterial({ color: 0x271911, roughness: 0.9 });
            const mustache = new THREE.Mesh(mustacheGeo, mustacheMat);
            mustache.position.set(0, 0.26, -0.37);
            mustache.rotation.z = 0.08;
            headPivot.add(mustache);
        } else if (cfg.hat === 'straw') {
            const strawBrimGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.04, 20);
            const strawMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.95 });
            const strawBrim = new THREE.Mesh(strawBrimGeo, strawMat);
            strawBrim.position.y = 0.58;
            headPivot.add(strawBrim);

            const strawCrownGeo = new THREE.CylinderGeometry(0.35, 0.38, 0.35, 16);
            const strawCrown = new THREE.Mesh(strawCrownGeo, strawMat);
            strawCrown.position.y = 0.75;
            headPivot.add(strawCrown);
        } else if (cfg.hat === 'shades') {
            const shadesGeo = new THREE.BoxGeometry(0.42, 0.12, 0.05);
            const shadesMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.2 });
            const shades = new THREE.Mesh(shadesGeo, shadesMat);
            shades.position.set(0, 0.35, -0.38);
            headPivot.add(shades);
        }

        ragdollGroup.add(headPivot);

        // ── 3. Braços Ragdoll Articulados ──
        const armMat = new THREE.MeshStandardMaterial({ color: skinMat.color, roughness: 0.6 });

        // Braço Esquerdo
        const armLeftPivot = new THREE.Group();
        armLeftPivot.position.set(-0.46, 0.85, 0);
        const armLGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 10);
        const armL = new THREE.Mesh(armLGeo, armMat);
        armL.position.set(0, -0.28, -0.25);
        armL.rotation.x = -0.7;
        armLeftPivot.add(armL);
        ragdollGroup.add(armLeftPivot);

        // Braço Direito (Usado para pancadas, arremessos e gestos)
        const armRightPivot = new THREE.Group();
        armRightPivot.position.set(0.46, 0.85, 0);
        const armRGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.6, 10);
        const armR = new THREE.Mesh(armRGeo, armMat);
        armR.position.set(0, -0.28, -0.25);
        armR.rotation.x = -0.7;
        armRightPivot.add(armR);

        // Mão direita gordinha
        const handGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const handR = new THREE.Mesh(handGeo, skinMat);
        handR.position.set(0, -0.58, -0.45);
        armRightPivot.add(handR);
        ragdollGroup.add(armRightPivot);

        // ── 4. Pernas Ragdoll & Chinelos de Dedo ──
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const flipflopMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 });

        // Perna Esquerda
        const legLeftPivot = new THREE.Group();
        legLeftPivot.position.set(-0.24, 0.15, 0);

        // Coxa horizontal
        const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.52, 8), pantsMat);
        thighL.rotation.x = Math.PI / 2;
        thighL.position.set(0, 0, -0.26);
        legLeftPivot.add(thighL);

        // Canela vertical
        const shinL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.55, 8), pantsMat);
        shinL.position.set(0, -0.3, -0.52);
        legLeftPivot.add(shinL);

        // Chinelo de dedo
        const footL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.26), flipflopMat);
        footL.position.set(0, -0.56, -0.56);
        legLeftPivot.add(footL);

        ragdollGroup.add(legLeftPivot);

        // Perna Direita
        const legRightPivot = new THREE.Group();
        legRightPivot.position.set(0.24, 0.15, 0);

        const thighR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.52, 8), pantsMat);
        thighR.rotation.x = Math.PI / 2;
        thighR.position.set(0, 0, -0.26);
        legRightPivot.add(thighR);

        const shinR = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.55, 8), pantsMat);
        shinR.position.set(0, -0.3, -0.52);
        legRightPivot.add(shinR);

        const footR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.26), flipflopMat);
        footR.position.set(0, -0.56, -0.56);
        legRightPivot.add(footR);

        ragdollGroup.add(legRightPivot);

        root.add(ragdollGroup);

        return {
            id: cfg.id,
            team: cfg.team,
            isLocal: cfg.isLocal,
            root,
            chairGroup,
            ragdollGroup,
            headPivot,
            eyeL,
            eyeR,
            pupilL,
            pupilR,
            mouth,
            armLeftPivot,
            armRightPivot,
            legLeftPivot,
            legRightPivot,
            baseRotY: cfg.rotY,
            // Estado de animação cômica
            animState: 'idle',
            animTimer: 0,
            animDuration: 0,
            headSpring: { x: 0, z: 0, vx: 0, vz: 0 },
            bodyBobOffset: Math.random() * 6.28
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
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 256, 360);

            ctx.strokeStyle = isManilha ? '#f59e0b' : '#cbd5e1';
            ctx.lineWidth = isManilha ? 8 : 4;
            ctx.strokeRect(10, 10, 236, 340);

            const isRed = (card.suit === 'copas' || card.suit === 'ouros');
            const mainColor = isRed ? '#dc2626' : '#0f172a';
            const suitSymbols = { paus: '♣', copas: '♥', espadas: '♠', ouros: '♦' };
            const symbol = suitSymbols[card.suit] || '♠';

            ctx.fillStyle = mainColor;
            ctx.font = 'bold 38px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(card.value, 24, 52);
            ctx.font = '32px serif';
            ctx.fillText(symbol, 25, 88);

            ctx.font = '105px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(symbol, 128, 185);

            ctx.save();
            ctx.translate(232, 308);
            ctx.rotate(Math.PI);
            ctx.font = 'bold 38px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(card.value, 0, 0);
            ctx.font = '32px serif';
            ctx.fillText(symbol, 1, 36);
            ctx.restore();

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
        texture.anisotropy = 2; // Leve para GPU fraca
        cardTextureCache.set(cacheKey, texture);
        return texture;
    }

    // ─── Pool de Partículas e Texturas Cômicas (Zero GC) ──────────────────────
    function initParticlePools() {
        // 1. Splash Drops (Gotas e Espuma de Cerveja)
        const dropGeo = new THREE.SphereGeometry(0.045, 6, 6);
        const foamMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
        const beerMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

        for (let i = 0; i < MAX_SPLASH_DROPS; i++) {
            const mesh = new THREE.Mesh(dropGeo, (i % 2 === 0) ? foamMat : beerMat);
            mesh.visible = false;
            scene.add(mesh);
            splashDropsPool.push({
                mesh,
                active: false,
                vx: 0, vy: 0, vz: 0,
                baseY: 0.12,
                life: 0,
                maxLife: 0
            });
        }

        // 2. Comic Billboards (Sprites de Onomatopeia 3D)
        for (let i = 0; i < MAX_COMIC_SPRITES; i++) {
            const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false });
            const sprite = new THREE.Sprite(mat);
            sprite.visible = false;
            scene.add(sprite);
            comicSpritesPool.push({
                sprite,
                mat,
                active: false,
                startTime: 0,
                duration: 0,
                baseScale: 1,
                rotSpeed: 0
            });
        }

        // 3. Zzz Sprites (Sinal de Sono / Tô Liso)
        const zzzTexture = getComicTexture('Zzz...');
        for (let i = 0; i < MAX_ZZZ_SPRITES; i++) {
            const mat = new THREE.SpriteMaterial({ map: zzzTexture, transparent: true, opacity: 0, depthWrite: false });
            const sprite = new THREE.Sprite(mat);
            sprite.visible = false;
            scene.add(sprite);
            zzzSpritesPool.push({
                sprite,
                mat,
                active: false,
                startTime: 0,
                duration: 0,
                driftX: 0
            });
        }
    }

    function getComicTexture(text) {
        if (comicTextureCache.has(text)) {
            return comicTextureCache.get(text);
        }

        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const centerX = 192;
        const centerY = 128;

        // Estilos temáticos de onomatopeia
        let bgFill = '#f59e0b';
        let strokeColor = '#000000';
        let textColor = '#ffffff';

        if (text.includes('TRUCO') || text.includes('DOZE') || text.includes('PANCADA')) {
            bgFill = '#dc2626';
        } else if (text.includes('ZAP') || text.includes('POW')) {
            bgFill = '#eab308';
        } else if (text.includes('CHORA') || text.includes('COVARDE')) {
            bgFill = '#2563eb';
        } else if (text.includes('Zzz')) {
            bgFill = '#64748b';
            textColor = '#cbd5e1';
        }

        // Fundo estilo estrela de gibi / balão cômico
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.fillStyle = bgFill;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 10;
        ctx.lineJoin = 'miter';

        if (text.includes('Zzz')) {
            // Nuvem de sono
            ctx.beginPath();
            ctx.arc(-40, 0, 50, 0, Math.PI * 2);
            ctx.arc(30, -15, 60, 0, Math.PI * 2);
            ctx.arc(90, 10, 45, 0, Math.PI * 2);
            ctx.arc(0, 30, 55, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            // Explosão estrelada
            ctx.beginPath();
            const points = 14;
            for (let i = 0; i < points * 2; i++) {
                const r = (i % 2 === 0) ? 120 : 65;
                const angle = (i * Math.PI) / points;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();

        // Texto em quadrinhos com contorno preto pesado
        ctx.font = '900 48px "Impact", "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(text, centerX, centerY);
        ctx.fillStyle = textColor;
        ctx.fillText(text, centerX, centerY);

        const texture = new THREE.CanvasTexture(canvas);
        comicTextureCache.set(text, texture);
        return texture;
    }

    function spawnComicPopup(text, posX, posY, posZ, scale = 1.35) {
        const item = comicSpritesPool.find(c => !c.active);
        if (!item) return;

        const texture = getComicTexture(text);
        item.mat.map = texture;
        item.mat.needsUpdate = true;
        item.sprite.position.set(posX, posY, posZ);
        item.sprite.scale.set(0.1, 0.1, 1);
        item.sprite.visible = true;
        item.mat.opacity = 1;
        item.active = true;
        item.startTime = performance.now();
        item.duration = 850;
        item.baseScale = scale;
        item.rotSpeed = (Math.random() - 0.5) * 0.3;
    }

    function spawnBeerSplashes(originX, originZ, count = 16) {
        let spawned = 0;
        for (let i = 0; i < splashDropsPool.length && spawned < count; i++) {
            const drop = splashDropsPool[i];
            if (!drop.active) {
                drop.active = true;
                drop.mesh.visible = true;
                drop.mesh.position.set(
                    originX + (Math.random() - 0.5) * 0.2,
                    0.4,
                    originZ + (Math.random() - 0.5) * 0.2
                );
                // Velocidade explosiva para cima e para os lados
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.04 + Math.random() * 0.08;
                drop.vx = Math.cos(angle) * speed;
                drop.vy = 0.12 + Math.random() * 0.14;
                drop.vz = Math.sin(angle) * speed;
                drop.life = 0;
                drop.maxLife = 40 + Math.floor(Math.random() * 20);
                spawned++;
            }
        }
    }

    function spawnZzzParticle(posX, posY, posZ) {
        const item = zzzSpritesPool.find(z => !z.active);
        if (!item) return;

        item.sprite.position.set(posX, posY, posZ);
        item.sprite.scale.set(0.6, 0.4, 1);
        item.sprite.visible = true;
        item.mat.opacity = 0.9;
        item.active = true;
        item.startTime = performance.now();
        item.duration = 1400;
        item.driftX = (Math.random() - 0.5) * 0.008;
    }

    // ─── Jogada de Carta 3D (Arremesso Físico na Mesa) ────────────────────────
    function onCardPlayed(data) {
        if (!isInitialized || viewMode !== '3d') return;

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

        if (data.isSlam || data.isManilha) {
            onTableSlam(data.playerId);
        } else {
            // Movimento suave do braço jogando a carta
            avatar.armRightPivot.rotation.x = -1.2;
            setTimeout(() => {
                if (avatar.animState === 'idle') {
                    avatar.armRightPivot.rotation.x = -0.7;
                }
            }, 260);
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

        const startPos = new THREE.Vector3();
        avatar.armRightPivot.getWorldPosition(startPos);
        startPos.y += 0.2;
        cardMesh.position.copy(startPos);

        const angle = Math.random() * Math.PI * 2;
        const radius = 0.45 + Math.random() * 0.45;
        const targetX = Math.cos(angle) * radius;
        const targetZ = Math.sin(angle) * radius;
        const targetY = 0.125 + (activeCards.length * 0.018);
        const targetRotY = (Math.random() - 0.5) * 1.5;

        scene.add(cardMesh);

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

                const arcHeight = (data.isSlam ? 0.6 : 1.3) * Math.sin(progress * Math.PI);
                cardMesh.position.y = THREE.MathUtils.lerp(startPos.y, targetY, easeT) + arcHeight;

                cardMesh.rotation.y = THREE.MathUtils.lerp(avatar.baseRotY, targetRotY, easeT);
                cardMesh.rotation.x = THREE.MathUtils.lerp(0.8, 0, easeT);
                cardMesh.rotation.z = Math.sin(progress * Math.PI) * 0.35;

                if (progress >= 1) {
                    cardMesh.position.set(targetX, targetY, targetZ);
                    cardMesh.rotation.set(0, targetRotY, 0);
                    return true;
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

    // ─── Tapa na Mesa (Pancada Ragdoll & Espuma de Cerveja) ────────────────────
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

        // O avatar do tapa ergue o braço com fúria e desce com força total
        slapper.armRightPivot.rotation.x = -1.9;
        setTimeout(() => {
            slapper.armRightPivot.rotation.x = -0.35;
            triggerSlamImpact(slapper);
        }, 120);

        setTimeout(() => {
            if (slapper.animState === 'idle') {
                slapper.armRightPivot.rotation.x = -0.7;
            }
        }, 380);
    }

    function triggerSlamImpact(slapper) {
        // 1. Tremor vigoroso de câmera
        cameraShake = 0.28;

        // 2. Onda de choque no feltro da mesa
        const shockGeo = new THREE.RingGeometry(0.15, 0.35, 30);
        const shockMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
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
                shockMat.opacity = 0.9 * (1 - p);
                if (p >= 1) {
                    scene.remove(shockMesh);
                    shockGeo.dispose();
                    shockMat.dispose();
                    return true;
                }
                return false;
            }
        });

        // 3. Pulo físico do copo americano e latinha
        if (tableProps.copo) {
            tableProps.copo.velY = 0.20;
            tableProps.copo.rotVel = 0.15;
            spawnBeerSplashes(-1.45, 0.9, 12);
        }
        if (tableProps.can) {
            tableProps.can.velY = 0.24;
            tableProps.can.rotVel = -0.18;
            spawnBeerSplashes(1.5, 0.7, 12);
        }

        // 4. Onomatopeia Cômica 3D Pop-up
        const slamWords = ['POW!', 'ZAP!', 'TOMA!', 'PANCADA!'];
        const word = slamWords[Math.floor(Math.random() * slamWords.length)];
        spawnComicPopup(word, 0, 1.2, 0, 1.4);

        // 5. Todos os avatares da mesa tomam um tranco na cabeça
        avatars.forEach(a => {
            a.headSpring.vx = (Math.random() - 0.5) * 0.3;
            a.headSpring.vz = -0.28;
        });
    }

    // ─── Grito de Truco: Subir na Mesa & Desafio Cômico ────────────────────────
    function onTrucoRequested(val, answeringTeam, requestedBy) {
        if (!isInitialized || viewMode !== '3d') return;

        // Zoom cinemático rápido da câmera (punch-in)
        const savedRadius = cameraOrbit.targetRadius;
        cameraOrbit.targetRadius = Math.max(4.2, cameraOrbit.targetRadius * 0.82);
        cameraShake = 0.25;
        setTimeout(() => {
            cameraOrbit.targetRadius = savedRadius;
        }, 1100);

        // Identifica texto cômico do aumento
        let trucoWord = 'TRUUUCO!';
        if (val === 6) trucoWord = 'SEEEIS!';
        else if (val === 9) trucoWord = 'NOOOVE!';
        else if (val === 12) trucoWord = 'PEDE DOZE!';

        avatars.forEach(a => {
            if (a.team !== answeringTeam) {
                // ── O Desafiante: SOBE NA MESA, bate no peito e grita com os braços pro alto! ──
                a.animState = 'climbing_table';
                a.animDuration = 1800;
                a.animTimer = a.animDuration;

                // Spawna letreiro cômico gigante sobre a cabeça do desafiante
                const worldPos = new THREE.Vector3();
                a.root.getWorldPosition(worldPos);
                spawnComicPopup(trucoWord, worldPos.x * 0.4, 2.1, worldPos.z * 0.4, 1.8);

                // Sacode a mesa e espirra cerveja
                spawnBeerSplashes(-1.45, 0.9, 10);
                spawnBeerSplashes(1.5, 0.7, 10);
            } else {
                // ── Quem recebe: Assusta-se e tomba pra trás na cadeira, cobrindo o rosto! ──
                a.animState = 'flinch';
                a.animDuration = 1400;
                a.animTimer = a.animDuration;
                a.headSpring.vz = 0.55;
                a.headSpring.vx = (Math.random() - 0.5) * 0.4;
            }
        });
    }

    // ─── Queda da Cadeira ao Correr do Truco (Ragdoll Tumble) ──────────────────
    function onPlayerRun(runningTeam) {
        if (!isInitialized || viewMode !== '3d') return;

        avatars.forEach(a => {
            if (a.team === runningTeam) {
                // O jogador da equipe que correu cai de costas com cadeira e tudo!
                a.animState = 'chair_tumble';
                a.animDuration = 3200;
                a.animTimer = a.animDuration;

                const worldPos = new THREE.Vector3();
                a.root.getWorldPosition(worldPos);
                spawnComicPopup('CHORA!', worldPos.x, 1.6, worldPos.z, 1.3);
            } else {
                // Os vencedores dão risada zombeteira
                a.animState = 'laughing';
                a.animDuration = 2000;
                a.animTimer = a.animDuration;
            }
        });

        cameraShake = 0.16;
    }

    // ─── Sinais Secretos Cômicos de Boteco (Desmaio do Bocejo / Tô Liso) ───────
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

        if (signalId === 'bocejo') {
            // ── DESMAIO DO BOCEJO ("Tô Liso / Sem Carta"): Cabeçada no Feltro e Ronco Zzz ──
            avatar.animState = 'bocejo_sleep';
            avatar.animDuration = 2600;
            avatar.animTimer = avatar.animDuration;

            // Spawna nuvens de Zzz subindo
            const headPos = new THREE.Vector3();
            avatar.headPivot.getWorldPosition(headPos);
            spawnZzzParticle(headPos.x, 1.2, headPos.z);
            setTimeout(() => spawnZzzParticle(headPos.x + 0.1, 1.45, headPos.z), 350);
            setTimeout(() => spawnZzzParticle(headPos.x - 0.1, 1.7, headPos.z), 700);

        } else if (signalId === 'piscar') {
            // Pisca e aponta a "arminha com os dedos" (Zap / Manilha Maior)
            avatar.animState = 'signal_piscar';
            avatar.animDuration = 1600;
            avatar.animTimer = avatar.animDuration;
            if (avatar.eyeR) avatar.eyeR.scale.y = 0.15;
            if (avatar.pupilR) avatar.pupilR.scale.y = 0.15;

        } else if (signalId === 'biquinho') {
            // Faz biquinho cômico (7 de Copas)
            avatar.animState = 'signal_biquinho';
            avatar.animDuration = 1600;
            avatar.animTimer = avatar.animDuration;

        } else if (signalId === 'sobrancelha') {
            // Sobrancelhas disparam pra cima e olhos arregalados (Espadilha)
            avatar.animState = 'signal_sobrancelha';
            avatar.animDuration = 1600;
            avatar.animTimer = avatar.animDuration;

        } else if (signalId === 'nariz') {
            // Coça o nariz furiosamente (7 de Ouros / Pica-fumo)
            avatar.animState = 'signal_nariz';
            avatar.animDuration = 1600;
            avatar.animTimer = avatar.animDuration;
        }
    }

    // ─── Fim de Jogo: Comemoração ou Queda em Desgraça ─────────────────────────
    function onGameOver(winnerTeam) {
        if (!isInitialized || viewMode !== '3d') return;

        avatars.forEach(a => {
            if (a.team === winnerTeam) {
                // Vencedores: pulam de alegria, braços pro alto, dança da vitória!
                a.animState = 'celebrating';
                a.animDuration = 8000;
                a.animTimer = a.animDuration;

                const worldPos = new THREE.Vector3();
                a.root.getWorldPosition(worldPos);
                spawnComicPopup('CAMPEÃO!', worldPos.x, 2.2, worldPos.z, 1.6);
            } else {
                // Perdedores: desabam de cabeça na mesa em choque
                a.animState = 'defeat';
                a.animDuration = 8000;
                a.animTimer = a.animDuration;
            }
        });
    }

    // ─── Loop de Renderização e Física dos Ragdolls (60 FPS Cravados) ──────────
    function startLoop() {
        if (isRunning) return;
        isRunning = true;

        let lastTime = performance.now();

        const animate = (now) => {
            if (!isRunning) return;
            animFrameId = requestAnimationFrame(animate);

            const dt = Math.min((now - lastTime) / 1000, 0.1); // clamp delta
            lastTime = now;

            // 1. Atualiza Transformação e Órbita Suave da Câmera
            updateCameraTransform();

            // 2. Atualiza Cartas em Voo na Mesa
            for (let i = activeCards.length - 1; i >= 0; i--) {
                const isDone = activeCards[i].update(now);
                if (isDone) {
                    activeCards.splice(i, 1);
                }
            }

            // 3. Atualiza Ondas de Choque
            for (let i = shockwaves.length - 1; i >= 0; i--) {
                const isDone = shockwaves[i].update(now);
                if (isDone) {
                    shockwaves.splice(i, 1);
                }
            }

            // 4. Física do Copo Americano e Latinha (Quique Amortecido)
            Object.values(tableProps).forEach(prop => {
                if (prop.velY !== 0 || prop.group.position.y > prop.baseY) {
                    prop.group.position.y += prop.velY;
                    prop.velY -= 0.015; // gravidade
                    if (prop.group.position.y <= prop.baseY) {
                        prop.group.position.y = prop.baseY;
                        prop.velY = -prop.velY * 0.42; // quique
                        if (Math.abs(prop.velY) < 0.01) prop.velY = 0;
                    }
                    prop.group.rotation.z += prop.rotVel;
                    prop.rotVel *= 0.86;
                }
            });

            // 5. Atualiza Partículas de Espuma e Gotas de Cerveja (Pool Ativo)
            splashDropsPool.forEach(drop => {
                if (drop.active) {
                    drop.mesh.position.x += drop.vx;
                    drop.mesh.position.y += drop.vy;
                    drop.mesh.position.z += drop.vz;
                    drop.vy -= 0.009; // gravidade na cerveja
                    drop.life++;

                    if (drop.mesh.position.y <= drop.baseY || drop.life >= drop.maxLife) {
                        drop.active = false;
                        drop.mesh.visible = false;
                    }
                }
            });

            // 6. Atualiza Onomatopeias Cômicas (Sprites 3D)
            comicSpritesPool.forEach(c => {
                if (c.active) {
                    const elapsed = now - c.startTime;
                    const p = Math.min(elapsed / c.duration, 1);

                    // Elastic scale pop
                    const scaleT = Math.sin(p * Math.PI * 0.85);
                    const currentScale = c.baseScale * (0.2 + 0.8 * Math.min(p * 4, 1) + 0.2 * scaleT);
                    c.sprite.scale.set(currentScale * 1.5, currentScale, 1);

                    // Sobe suavemente flutuando
                    c.sprite.position.y += 0.006;
                    c.mat.rotation += c.rotSpeed * dt;

                    // Fade out final
                    if (p > 0.65) {
                        c.mat.opacity = (1 - p) / 0.35;
                    }

                    if (p >= 1) {
                        c.active = false;
                        c.sprite.visible = false;
                    }
                }
            });

            // 7. Atualiza Partículas Zzz... (Sono / Tô Liso)
            zzzSpritesPool.forEach(z => {
                if (z.active) {
                    const elapsed = now - z.startTime;
                    const p = Math.min(elapsed / z.duration, 1);

                    z.sprite.position.y += 0.008;
                    z.sprite.position.x += Math.sin(now * 0.005) * 0.003 + z.driftX;

                    const scale = 0.5 + p * 0.5;
                    z.sprite.scale.set(scale * 1.4, scale, 1);

                    if (p > 0.7) {
                        z.mat.opacity = (1 - p) / 0.3;
                    }

                    if (p >= 1) {
                        z.active = false;
                        z.sprite.visible = false;
                    }
                }
            });

            // 8. Máquina de Estados e Cinemática Ragdoll dos Avatares
            const time = now * 0.003;

            avatars.forEach((a, idx) => {
                // Spring Physics na cabeça
                const springK = 0.16;
                const damp = 0.82;
                a.headSpring.vx += (-a.headSpring.x) * springK;
                a.headSpring.vz += (-a.headSpring.z) * springK;
                a.headSpring.vx *= damp;
                a.headSpring.vz *= damp;
                a.headSpring.x += a.headSpring.vx;
                a.headSpring.z += a.headSpring.vz;

                // Contagem regressiva do estado de animação
                if (a.animTimer > 0) {
                    a.animTimer -= dt * 1000;
                    if (a.animTimer <= 0) {
                        recoverAvatarToIdle(a);
                    }
                }

                // Renderiza poses baseadas no estado ragdoll
                updateAvatarRagdollPose(a, idx, time, now);
            });

            renderer.render(scene, camera);
        };

        animFrameId = requestAnimationFrame(animate);
    }

    function recoverAvatarToIdle(a) {
        a.animState = 'idle';
        a.chairGroup.rotation.set(0, 0, 0);
        a.chairGroup.position.set(0, -0.5, 0.45);
        a.ragdollGroup.position.set(0, 0, 0);
        a.ragdollGroup.rotation.set(0, 0, 0);
        a.headPivot.rotation.set(0, 0, 0);
        a.armLeftPivot.rotation.set(-0.7, 0, 0);
        a.armRightPivot.rotation.set(-0.7, 0, 0);
        a.legLeftPivot.rotation.set(0, 0, 0);
        a.legRightPivot.rotation.set(0, 0, 0);
        if (a.eyeR) a.eyeR.scale.set(1, 1, 1);
        if (a.pupilR) a.pupilR.scale.set(1, 1, 1);
        if (a.eyeL) a.eyeL.scale.set(1, 1, 1);
        if (a.pupilL) a.pupilL.scale.set(1, 1, 1);
        if (a.mouth) a.mouth.scale.set(1, 1, 1);
    }

    function updateAvatarRagdollPose(a, idx, time, now) {
        switch (a.animState) {
            case 'idle': {
                // Respiração suave e wiggle de botequim
                const breath = Math.sin(time + a.bodyBobOffset) * 0.018;
                a.ragdollGroup.position.y = breath;
                a.chairGroup.rotation.set(0, 0, 0);
                a.chairGroup.position.set(0, -0.5, 0.45);

                const idleWiggle = Math.sin(time * 0.7 + idx) * 0.04;
                a.headPivot.rotation.y = idleWiggle + a.headSpring.x;
                a.headPivot.rotation.x = a.headSpring.z;
                break;
            }

            case 'climbing_table': {
                // ── SUBIR NA MESA: corpo pula pra frente em cima do feltro, braços agitando ──
                a.ragdollGroup.position.y = 0.82 + Math.sin(now * 0.02) * 0.05;
                a.ragdollGroup.position.z = -1.25;
                a.ragdollGroup.rotation.x = 0.28;

                // Pernas agachadas na borda da mesa
                a.legLeftPivot.rotation.x = 0.8;
                a.legRightPivot.rotation.x = 0.8;

                // Braços gesticulando freneticamente
                const armWave1 = -2.4 + Math.sin(now * 0.018) * 0.45;
                const armWave2 = -2.4 - Math.sin(now * 0.018) * 0.45;
                a.armLeftPivot.rotation.x = armWave1;
                a.armRightPivot.rotation.x = armWave2;

                a.headPivot.rotation.x = -0.3 + Math.sin(now * 0.02) * 0.15;
                break;
            }

            case 'flinch': {
                // ── LEVOU SUSTO COM O TRUCO: joga o corpo pra trás e cobre o rosto ──
                a.chairGroup.rotation.x = -0.25;
                a.ragdollGroup.position.z = -0.55;
                a.armLeftPivot.rotation.x = -2.1;
                a.armRightPivot.rotation.x = -2.1;
                a.headPivot.rotation.x = 0.4;
                break;
            }

            case 'chair_tumble': {
                // ── QUEDA DA CADEIRA (CORREU DO TRUCO): cadeira capota pra trás e boneco esparrama no chão ──
                const p = 1 - (a.animTimer / a.animDuration);
                if (p < 0.18) {
                    // Tomba pra trás na cadeira
                    const fallEase = p / 0.18;
                    a.chairGroup.rotation.x = -fallEase * 1.45;
                    a.ragdollGroup.position.z = fallEase * 1.3;
                    a.ragdollGroup.position.y = -fallEase * 0.75;
                    a.ragdollGroup.rotation.x = -fallEase * 1.35;
                } else if (p < 0.75) {
                    // No chão esparramado com pernas e braços debatendo de vergonha
                    a.chairGroup.rotation.x = -1.45;
                    a.ragdollGroup.position.z = 1.3;
                    a.ragdollGroup.position.y = -0.75;
                    a.ragdollGroup.rotation.x = -1.35;

                    a.armLeftPivot.rotation.x = -2.5 + Math.sin(now * 0.015) * 0.35;
                    a.armRightPivot.rotation.x = -2.5 - Math.sin(now * 0.015) * 0.35;
                    a.legLeftPivot.rotation.x = -1.1 + Math.sin(now * 0.012) * 0.3;
                    a.legRightPivot.rotation.x = -1.4 - Math.sin(now * 0.012) * 0.3;
                    a.headPivot.rotation.x = 0.6;
                } else {
                    // Recuperando e levantando sem graça
                    const recoverP = (p - 0.75) / 0.25;
                    const rEase = 1 - recoverP;
                    a.chairGroup.rotation.x = -1.45 * rEase;
                    a.ragdollGroup.position.z = 1.3 * rEase;
                    a.ragdollGroup.position.y = -0.75 * rEase;
                    a.ragdollGroup.rotation.x = -1.35 * rEase;
                }
                break;
            }

            case 'laughing': {
                // Risada zombeteira sacudindo a barriga
                a.ragdollGroup.position.y = Math.sin(now * 0.025) * 0.04;
                a.headPivot.rotation.x = -0.2 + Math.sin(now * 0.025) * 0.2;
                a.armLeftPivot.rotation.x = -1.2;
                a.armRightPivot.rotation.x = -1.2;
                break;
            }

            case 'bocejo_sleep': {
                // ── DESMAIO DO BOCEJO ("Tô Liso"): cai de cabeça direto no feltro verde ──
                a.ragdollGroup.position.z = 0.45;
                a.ragdollGroup.rotation.x = 1.05; // debruçado sobre a mesa
                a.headPivot.rotation.x = 0.5;
                a.armLeftPivot.rotation.x = -0.4;
                a.armRightPivot.rotation.x = -0.4;
                break;
            }

            case 'signal_piscar': {
                // Pisca o olho e faz arminha com a mão direita
                a.headPivot.rotation.z = 0.35;
                a.headPivot.rotation.y = -0.2;
                a.armRightPivot.rotation.x = -1.5;
                break;
            }

            case 'signal_biquinho': {
                // Biquinho cômico (7 de copas)
                a.headPivot.rotation.x = -0.25;
                a.headPivot.rotation.z = Math.sin(now * 0.015) * 0.2;
                if (a.mouth) a.mouth.scale.set(0.6, 1.4, 1.8);
                break;
            }

            case 'signal_sobrancelha': {
                // Olhos esbugalhados
                a.headPivot.rotation.x = 0.35;
                if (a.eyeL) a.eyeL.scale.set(1.5, 1.5, 1.5);
                if (a.eyeR) a.eyeR.scale.set(1.5, 1.5, 1.5);
                break;
            }

            case 'signal_nariz': {
                // Coça o nariz com a mão direita
                a.armRightPivot.rotation.x = -1.75;
                a.armRightPivot.rotation.y = -0.45 + Math.sin(now * 0.035) * 0.25;
                break;
            }

            case 'celebrating': {
                // Dança da vitória!
                a.ragdollGroup.position.y = Math.abs(Math.sin(now * 0.012)) * 0.35;
                a.armLeftPivot.rotation.x = -2.7 + Math.sin(now * 0.01) * 0.3;
                a.armRightPivot.rotation.x = -2.7 - Math.sin(now * 0.01) * 0.3;
                a.headPivot.rotation.y = Math.sin(now * 0.015) * 0.4;
                break;
            }

            case 'defeat': {
                // Cabeça baixa derrotada
                a.ragdollGroup.rotation.x = 0.65;
                a.headPivot.rotation.x = 0.6;
                a.armLeftPivot.rotation.x = -0.3;
                a.armRightPivot.rotation.x = -0.3;
                break;
            }
        }
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

    // ─── Exportação da API Pública ────────────────────────────────────────────
    window.Truco3D = {
        init,
        setMode,
        toggleMode,
        getMode: () => viewMode,
        resetCamera,
        onCardPlayed,
        onTrickEnded,
        onTableSlam,
        onTrucoRequested,
        onSecretSignal,
        onPlayerRun,
        onGameOver,
        updatePlayers,
        clearTable
    };

})(window);
