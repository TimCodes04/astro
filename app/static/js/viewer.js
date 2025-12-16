let scene, camera, renderer, points, controls;
let currentFileId = null;
let gridHelper = null;
let currentCoordSystem = 'cartesian';
let globalData = null;
let dataCenter = new THREE.Vector3(0, 0, 0);
let idMap = {};
let selectedHaloId = null; // Track selected halo for reactive updates
let raycaster, mouse;
let connectionLines;

document.addEventListener('DOMContentLoaded', init);

function init() {
    // Scene Setup
    const container = document.getElementById('viewer3d');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Use a massive far plane initially to prevent clipping of astronomical usage
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1e27);
    camera.position.z = 100;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    console.log("Init Viewer3D", {
        width: container.clientWidth,
        height: container.clientHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight
    });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Raycaster & Interaction
    raycaster = new THREE.Raycaster();
    // Increase threshold for easier clicking on points
    raycaster.params.Points.threshold = 1.0;
    mouse = new THREE.Vector2();

    // Connection Lines (initially hidden)
    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.8, linewidth: 2 });
    connectionLines = new THREE.LineSegments(lineGeo, lineMat);
    connectionLines.visible = false;
    scene.add(connectionLines);

    // Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    // Use the renderer's domElement for click events to ensure coordinates are relative to canvas
    renderer.domElement.addEventListener('click', onMouseClick, false);
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('pointSize').addEventListener('input', updatePointSize);
    document.getElementById('opacity').addEventListener('input', updateOpacity);
    document.getElementById('applyFilter').addEventListener('click', applyFilters);
    document.getElementById('applyFilter').addEventListener('click', applyFilters);
    document.getElementById('coordSystem').addEventListener('change', updateCoordinateSystem);
    document.getElementById('centerGrid').addEventListener('change', updateCoordinateSystem);
    document.getElementById('colorMap').addEventListener('change', updateColorMap);
    document.getElementById('colorBy').addEventListener('change', updateColorMap);

    updateCoordinateSystem(); // Initialize grid

    // Tab Switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            const tabId = btn.dataset.tab;
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Trigger resize for specific views
            if (tabId === 'viewer') {
                onWindowResize(); // Resize 3D viewer
            } else if (tabId === 'dashboard') {
                // Resize Plotly charts to fit new container dimensions
                setTimeout(() => {
                    const chartIds = ['hmfChart', 'cumulativeHmfChart', 'radiusChart', 'scatterChart'];
                    chartIds.forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.data) {
                            Plotly.Plots.resize(el);
                        }
                    });
                }, 50); // Small delay to allow layout to settle
            }
        });
    });

    animate();
}

async function loadHierarchy(fileId, rootId = null, container = null) {
    if (!container) {
        container = document.getElementById('subhalo-hierarchy');
        if (!container) return; // Guard if element missing
        container.innerHTML = ''; // Clear loading/placeholder
    }

    try {
        const url = rootId
            ? `${API_BASE_URL}/hierarchy/${fileId}?root_id=${rootId}`
            : `${API_BASE_URL}/hierarchy/${fileId}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load hierarchy');
        const nodes = await response.json();

        if (nodes.length === 0) {
            if (!rootId) container.innerHTML = '<div class="placeholder-text">No hierarchy data found.</div>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'tree-list';

        nodes.forEach(node => {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'tree-node';
            nodeEl.dataset.id = node.id;

            const content = document.createElement('div');
            content.className = 'tree-content';

            const toggle = document.createElement('span');
            toggle.className = 'tree-toggle';
            toggle.textContent = node.has_children ? '▶' : '•';

            const label = document.createElement('span');
            label.className = 'tree-label';
            label.textContent = `Halo ${node.id} (M: ${node.mass.toExponential(1)})`;

            const coords = document.createElement('span');
            coords.className = 'halo-coords';
            // Initial coordinate calculation - Always visible
            if (node.x !== undefined) {
                coords.textContent = ` (${formatCoordinates(node.x, node.y, node.z, currentCoordSystem)})`;
            }

            content.appendChild(toggle);
            content.appendChild(label);
            content.appendChild(coords);
            nodeEl.appendChild(content);

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            nodeEl.appendChild(childrenContainer);

            // Interaction
            content.onclick = (e) => {
                e.stopPropagation();
                highlightHalo(node.id);

                // Toggle children if arrow clicked or if we want auto-expand
                if (node.has_children) {
                    if (childrenContainer.classList.contains('expanded')) {
                        childrenContainer.classList.remove('expanded');
                        toggle.textContent = '▶';
                    } else {
                        childrenContainer.classList.add('expanded');
                        toggle.textContent = '▼';
                        if (childrenContainer.children.length === 0) {
                            loadHierarchy(fileId, node.id, childrenContainer);
                        }
                    }
                }
            };

            list.appendChild(nodeEl);
        });

        container.appendChild(list);

    } catch (error) {
        console.error('Hierarchy error:', error);
        if (!rootId && container) container.innerHTML = '<div class="error-text">Error loading hierarchy.</div>';
    }
}

function highlightHalo(id, relatedIds = []) {
    console.log('Highlighting Halo:', id, 'Related:', relatedIds);

    // Clear all highlights
    document.querySelectorAll('.tree-content').forEach(el => {
        el.style.background = '';
        el.style.border = '';
    });

    // Highlight Primary (Clicked)
    const selectedNode = document.querySelector(`.tree-node[data-id="${id}"] > .tree-content`);
    if (selectedNode) {
        selectedNode.style.background = 'rgba(255, 255, 255, 0.3)';
        selectedNode.style.border = '1px solid var(--accent)';
        selectedNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Highlight Related (Parent/Children)
    relatedIds.forEach(relId => {
        const relNode = document.querySelector(`.tree-node[data-id="${relId}"] > .tree-content`);
        if (relNode) {
            relNode.style.background = 'rgba(255, 255, 255, 0.1)';
            relNode.style.border = '1px dashed #888';
        }
    });

    // Update Display (Overlay + Tree Text)
    updateHaloDisplay(id);

    // Trigger 3D connection view
    if (idMap && idMap.hasOwnProperty(id)) {
        showConnections(idMap[id]);
    }
}

function onMouseClick(event) {
    // Calculate mouse position in normalized device coordinates (-1 to +1) for both components
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Intersect with points
    if (points) {
        const intersects = raycaster.intersectObject(points);

        if (intersects.length > 0) {
            // Get the closest intersection
            const index = intersects[0].index;
            const id = globalData.id[index];

            // Find related IDs
            const relatedIds = [];

            // Parent
            const parentId = globalData.parent_id ? globalData.parent_id[index] : -1;
            if (parentId !== -1) relatedIds.push(parentId);

            // Children
            if (globalData.parent_id) {
                for (let i = 0; i < globalData.parent_id.length; i++) {
                    if (globalData.parent_id[i] === id) {
                        relatedIds.push(globalData.id[i]);
                    }
                }
            }

            console.log("Clicked Halo ID:", id, "Related:", relatedIds);
            // Store selected ID
            selectedHaloId = id;
            highlightHalo(id, relatedIds);
        } else {
            // Clicked on empty space
            clearConnections();

            // Clear selection state
            selectedHaloId = null;

            // Also clear tree selection
            document.querySelectorAll('.tree-content').forEach(el => {
                el.style.background = '';
                el.style.border = '';
            });
            document.getElementById('haloInfoOverlay').style.display = 'none';
        }
    }
}

function updateCoordinateSystem() {
    currentCoordSystem = document.getElementById('coordSystem').value;

    // Update Grid
    if (gridHelper) scene.remove(gridHelper);

    // Choose size based on current data or default
    const size = 100;
    const divisions = 20;
    const color = 0x888888;

    if (currentCoordSystem === 'cartesian') {
        gridHelper = new THREE.GridHelper(size, divisions, color, 0x444444);
    } else if (currentCoordSystem === 'cylindrical') {
        gridHelper = new THREE.PolarGridHelper(size / 2, 16, 8, 64, color, color);
    } else if (currentCoordSystem === 'spherical') {
        // Simple approximation: multiple polar grids or a wireframe sphere
        gridHelper = new THREE.Group();
        const g1 = new THREE.PolarGridHelper(size / 2, 16, 8, 64, color, color);
        const g2 = new THREE.PolarGridHelper(size / 2, 16, 8, 64, color, color);
        g2.rotation.x = Math.PI / 2;
        gridHelper.add(g1);
        gridHelper.add(g2);
    }

    const useRelative = document.getElementById('centerGrid').checked;

    if (useRelative) {
        gridHelper.position.copy(dataCenter);
        showNotification("Switched to Relative Coordinates (Centered)");
    } else {
        gridHelper.position.set(0, 0, 0);
        showNotification("Switched to Absolute Coordinates (World Origin)");
    }

    scene.add(gridHelper);

    // Reactive Update: Update ALL visible hierarchy nodes
    const treeNodes = document.querySelectorAll('.tree-node');
    treeNodes.forEach(node => {
        const id = parseInt(node.dataset.id);
        const idx = idMap[id];
        if (idx !== undefined && globalData) {
            let x = globalData.x[idx];
            let y = globalData.y[idx];
            let z = globalData.z[idx];

            if (useRelative) {
                x -= dataCenter.x;
                y -= dataCenter.y;
                z -= dataCenter.z;
            }

            const text = formatCoordinates(x, y, z, currentCoordSystem);

            const coordSpan = node.querySelector('.halo-coords');
            if (coordSpan) {
                coordSpan.textContent = ` (${text})`;
            }
        }
    });

    // Also update overlay if something is selected
    if (selectedHaloId !== null) {
        updateHaloDisplay(selectedHaloId);
    }
}

function showNotification(message) {
    const overlay = document.getElementById('haloInfoOverlay');
    const originalDisplay = overlay.style.display;
    const originalContent = overlay.innerHTML;

    // Use a separate notification element or hijack the overlay temporarily
    // Ideally we'd have a toast, but keeping it simple:
    const notification = document.createElement('div');
    notification.style.position = 'absolute';
    notification.style.top = '60px';
    notification.style.right = '10px';
    notification.style.background = 'rgba(33, 150, 243, 0.9)';
    notification.style.color = 'white';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '4px';
    notification.style.fontFamily = 'sans-serif';
    notification.style.transition = 'opacity 0.5s';
    notification.textContent = message;

    document.getElementById('viewer3d').appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 2000);
}

function updateHaloDisplay(id) {
    const idx = idMap[id];
    if (globalData && idx !== undefined) {
        let x = globalData.x[idx];
        let y = globalData.y[idx];
        let z = globalData.z[idx];

        // Check relative mode
        if (document.getElementById('centerGrid').checked) {
            x -= dataCenter.x;
            y -= dataCenter.y;
            z -= dataCenter.z;
        }

        const text = formatCoordinates(x, y, z, currentCoordSystem);

        // Update Overlay
        const overlay = document.getElementById('haloInfoOverlay');
        overlay.style.display = 'block';
        overlay.innerHTML = `<strong>Halo ${id}</strong><br>${text}`;
    }
}

function formatCoordinates(x, y, z, system) {
    if (system === 'cartesian') {
        return `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`;
    } else if (system === 'cylindrical') {
        const rho = Math.sqrt(x * x + y * y);
        const phi = Math.atan2(y, x);
        return `ρ: ${rho.toFixed(2)}, φ: ${phi.toFixed(2)} rad, Z: ${z.toFixed(2)}`;
    } else if (system === 'spherical') {
        const r = Math.sqrt(x * x + y * y + z * z);
        const theta = Math.acos(z / r);
        const phi = Math.atan2(y, x);
        return `r: ${r.toFixed(2)}, θ: ${theta.toFixed(2)}, φ: ${phi.toFixed(2)}`;
    }
    return '';
}

function showConnections(index) {
    if (!globalData || !idMap) return;

    const positions = [];
    const currentId = globalData.id[index];
    const parentId = globalData.parent_id ? globalData.parent_id[index] : -1;

    const x = globalData.x[index];
    const y = globalData.y[index];
    const z = globalData.z[index];

    // 1. Connection to Parent
    if (parentId !== -1 && idMap.hasOwnProperty(parentId)) {
        const pIdx = idMap[parentId];
        positions.push(x, y, z);
        positions.push(globalData.x[pIdx], globalData.y[pIdx], globalData.z[pIdx]);
    }

    // 2. Connection to Children
    if (globalData.parent_id) {
        for (let i = 0; i < globalData.parent_id.length; i++) {
            if (globalData.parent_id[i] === currentId) {
                positions.push(x, y, z);
                positions.push(globalData.x[i], globalData.y[i], globalData.z[i]);
            }
        }
    }

    if (positions.length > 0) {
        connectionLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        connectionLines.geometry.computeBoundingSphere();
        connectionLines.visible = true;
    } else {
        connectionLines.visible = false;
    }
}

function clearConnections() {
    connectionLines.visible = false;
}

function onWindowResize() {
    const container = document.getElementById('viewer3d');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('fileName').textContent = file.name;
    document.getElementById('loadingOverlay').style.display = 'flex';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const uploadRes = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const uploadData = await uploadRes.json();
        currentFileId = uploadData.file_id;

        // If H5, Scan Schema
        if (file.name.endsWith('.h5') || file.name.endsWith('.hdf5')) {
            const scanRes = await fetch(`${API_BASE_URL}/scan/${currentFileId}`, { method: 'POST' });
            if (!scanRes.ok) throw new Error('Scan failed');
            const scanData = await scanRes.json();

            // Show Modal for Mapping
            showSchemaModal(scanData.datasets, scanData.schema);
        } else {
            // CSV or other, proceed as normal
            await loadDataAndStats(currentFileId);
        }

    } catch (error) {
        console.error(error);
        alert('Error processing file: ' + error.message);
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

function showSchemaModal(datasets, proposedSchema) {
    const modal = document.getElementById('schemaModal');
    const selects = {
        id: document.getElementById('mapId'),
        mass: document.getElementById('mapMass'),
        pos: document.getElementById('mapPos'),
        radius: document.getElementById('mapRadius'),
        parent_id: document.getElementById('mapParent')
    };

    // Populate Dropdowns
    Object.values(selects).forEach(sel => {
        sel.innerHTML = sel.id === 'mapRadius' || sel.id === 'mapParent' ? '<option value="">-- None --</option>' : '';
        datasets.forEach(ds => {
            const option = document.createElement('option');
            option.value = ds.path;
            option.textContent = `${ds.path} (${ds.shape})`;
            sel.appendChild(option);
        });
    });

    // Set Proposed Values
    if (proposedSchema.id) selects.id.value = proposedSchema.id;
    if (proposedSchema.mass) selects.mass.value = proposedSchema.mass;
    if (proposedSchema.pos) selects.pos.value = proposedSchema.pos;
    if (proposedSchema.radius) selects.radius.value = proposedSchema.radius;
    if (proposedSchema.parent_id) selects.parent_id.value = proposedSchema.parent_id;

    modal.style.display = 'flex';
    document.getElementById('loadingOverlay').style.display = 'none';

    // Handle Confirm
    document.getElementById('confirmSchema').onclick = async () => {
        const schema = {
            id: selects.id.value,
            mass: selects.mass.value,
            pos: selects.pos.value,
            radius: selects.radius.value || null,
            parent_id: selects.parent_id.value || null
        };

        if (!schema.id || !schema.mass || !schema.pos) {
            alert('Please map all required fields (ID, Mass, Position).');
            return;
        }

        modal.style.display = 'none';
        document.getElementById('loadingOverlay').style.display = 'flex';

        try {
            const ingestRes = await fetch(`${API_BASE_URL}/ingest/${currentFileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schema)
            });
            if (!ingestRes.ok) throw new Error('Ingestion failed');

            // Now load data
            await loadDataAndStats(currentFileId);

            // Load Hierarchy
            await loadHierarchy(currentFileId);
        } catch (error) {
            console.error(error);
            alert('Ingestion error: ' + error.message);
        } finally {
            document.getElementById('loadingOverlay').style.display = 'none';
        }
    };

    document.getElementById('cancelSchema').onclick = () => {
        modal.style.display = 'none';
    };
}

async function loadDataAndStats(fileId, params = '') {
    try {
        const [dataRes, statsRes] = await Promise.all([
            fetch(`${API_BASE_URL}/data/${fileId}?${params}`),
            fetch(`${API_BASE_URL}/stats/${fileId}`)
        ]);

        if (!dataRes.ok || !statsRes.ok) throw new Error('Failed to fetch data');

        const data = await dataRes.json();
        const stats = await statsRes.json();

        renderData(data);
        globalData = data; // Store for raycasting lookup
        console.log("Global Data Loaded:", {
            hasMass: !!globalData.mass,
            massLen: globalData.mass ? globalData.mass.length : 0,
            hasRadius: !!globalData.radius,
            radiusLen: globalData.radius ? globalData.radius.length : 0
        });

        if (params) {
            const subsetStats = {
                total_particles: data.mass.length,
                total_mass: data.mass.reduce((a, b) => a + b, 0),
                ...stats
            };
            subsetStats.total_particles = data.mass.length;
            if (window.updateCharts) {
                window.updateCharts(subsetStats, data);
            }
        } else {
            if (window.updateCharts) {
                window.updateCharts(stats, data);
            }
        }

    } catch (error) {
        console.error(error);
        alert('Error loading data: ' + error.message);
    }
}

function renderData(data) {
    if (points) scene.remove(points);

    // Build ID Map for fast lookup
    idMap = {};
    if (data.id) {
        for (let i = 0; i < data.id.length; i++) {
            idMap[data.id[i]] = i;
        }
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    const colorScale = new THREE.Color();
    // Safe Min/Max calculation for large arrays to avoid stack overflow
    let minMass = Infinity;
    let maxMass = -Infinity;
    if (data.mass && data.mass.length > 0) {
        for (let i = 0; i < data.mass.length; i++) {
            if (data.mass[i] < minMass) minMass = data.mass[i];
            if (data.mass[i] > maxMass) maxMass = data.mass[i];
        }
    } else {
        minMass = 0;
        maxMass = 1;
    }
    const massRange = maxMass - minMass || 1;

    console.log(`RenderData: Processing ${data.x.length} points. Mass Range: ${minMass} - ${maxMass}`);

    for (let i = 0; i < data.x.length; i++) {
        // Explicitly cast to Number to avoid string/type issues
        vertices.push(Number(data.x[i]), Number(data.y[i]), Number(data.z[i]));

        // Color by mass (heatmap: blue -> red)
        const normalizedMass = (data.mass[i] - minMass) / massRange;
        colorScale.setHSL(0.6 - (normalizedMass * 0.6), 1.0, 0.5);
        colors.push(colorScale.r, colorScale.g, colorScale.b);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Generate a simple circular sprite to avoid external dependencies/CORS issues
    const getSprite = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        context.shadowBlur = 0;
        context.shadowColor = 'none';

        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);

        const text = new THREE.CanvasTexture(canvas);
        return text;
    };

    const material = new THREE.PointsMaterial({
        size: parseFloat(document.getElementById('pointSize').value),
        vertexColors: true,
        transparent: true,
        opacity: parseFloat(document.getElementById('opacity').value),
        sizeAttenuation: true,
        map: getSprite(),
        depthWrite: false, // Fix transparency overlapping issue
        blending: THREE.AdditiveBlending // Better for space particles
    });

    points = new THREE.Points(geometry, material);
    // Disable frustrating culling issues if bounding sphere is wonky
    points.frustumCulled = false;
    scene.add(points);

    // Center camera and adjust frustum to fit data
    geometry.computeBoundingSphere();
    const center = geometry.boundingSphere.center;
    dataCenter.copy(center); // Store for grid centering
    const radius = geometry.boundingSphere.radius || 100; // Default if 0

    console.log("RenderData Layout:", { center, radius });

    if (!isNaN(center.x)) {
        controls.target.copy(center);

        // Robust Camera Fitting
        const fov = camera.fov * (Math.PI / 180);
        let distance = Math.abs(radius / Math.sin(fov / 2));
        distance *= 1.5; // Add some padding

        // Dynamically adjust planes to prevent clipping z-fighting
        camera.near = radius / 100000;
        camera.far = radius * 100;
        if (camera.near < 0.001) camera.near = 0.001;

        camera.updateProjectionMatrix();

        camera.position.copy(center);
        camera.position.z += distance;
        camera.lookAt(center);

        controls.update();

        // Auto-scale point size if it seems too small/large compared to scene
        // Just a heuristic trigger if user hasn't messed with it
        const optimalSize = radius / 1000;
        // Don't override user input aggressively, but maybe log it or set if default
        console.log("Optimal point size approx:", optimalSize);
    }
}


function updatePointSize(e) {
    if (points) points.material.size = parseFloat(e.target.value);
}

function updateOpacity(e) {
    if (points) points.material.opacity = parseFloat(e.target.value);
}

// --- Color Mapping Logic ---
const COLOR_MAPS = {
    viridis: [
        [0.0, 0.267, 0.005, 0.329],
        [0.2, 0.282, 0.224, 0.490],
        [0.4, 0.208, 0.392, 0.529],
        [0.6, 0.129, 0.533, 0.553],
        [0.8, 0.255, 0.714, 0.459],
        [1.0, 0.992, 0.906, 0.145]
    ],
    plasma: [
        [0.0, 0.051, 0.027, 0.529],
        [0.2, 0.325, 0.008, 0.584],
        [0.4, 0.569, 0.157, 0.498],
        [0.6, 0.812, 0.380, 0.306],
        [0.8, 0.949, 0.647, 0.149],
        [1.0, 0.941, 0.976, 0.129]
    ],
    inferno: [
        [0.0, 0.001, 0.003, 0.024],
        [0.2, 0.173, 0.043, 0.259],
        [0.4, 0.431, 0.118, 0.345],
        [0.6, 0.749, 0.349, 0.169],
        [0.8, 0.933, 0.659, 0.192],
        [1.0, 0.988, 0.992, 0.647]
    ],
    magma: [
        [0.0, 0.001, 0.001, 0.020],
        [0.2, 0.137, 0.063, 0.298],
        [0.4, 0.369, 0.067, 0.400],
        [0.6, 0.706, 0.176, 0.325],
        [0.8, 0.984, 0.494, 0.435],
        [1.0, 0.988, 0.992, 0.749]
    ]
};

function lerpColor(map, t) {
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    // Find segment
    // Map has 6 points (0, 0.2, 0.4 ... 1.0)
    // Segment width is 0.2
    let seg = t * (map.length - 1);
    let idx = Math.floor(seg);
    let frac = seg - idx;

    if (idx >= map.length - 1) return map[map.length - 1].slice(1);

    const c1 = map[idx];
    const c2 = map[idx + 1];

    return [
        c1[1] + (c2[1] - c1[1]) * frac,
        c1[2] + (c2[2] - c1[2]) * frac,
        c1[3] + (c2[3] - c1[3]) * frac
    ];
}

function updateColorMap() {
    if (!globalData || !points) return;

    const mapName = document.getElementById('colorMap').value.toLowerCase();
    const colorBy = document.getElementById('colorBy').value;
    const map = COLOR_MAPS[mapName] || COLOR_MAPS['viridis'];

    // Choose Data Source
    let dataArray = globalData.mass;
    let label = "Mass";

    console.log("UpdateColorMap Request:", colorBy);

    if (colorBy === 'radius') {
        if (globalData.radius && globalData.radius.length > 0) {
            dataArray = globalData.radius;
            label = "Radius";
            console.log("Switched to Radius. Range:", Math.min(...dataArray), Math.max(...dataArray));
        } else {
            // Fallback if no radius
            alert("No radius data available in this dataset. Reverting to Mass.");
            document.getElementById('colorBy').value = 'mass';
            dataArray = globalData.mass;
        }
    }

    // Recalculate Min/Max
    let minVal = Infinity;
    let maxVal = -Infinity;

    if (dataArray && dataArray.length > 0) {
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] < minVal) minVal = dataArray[i];
            if (dataArray[i] > maxVal) maxVal = dataArray[i];
        }
    } else {
        minVal = 0; maxVal = 1;
    }

    const range = maxVal - minVal || 1;
    const colors = new Float32Array(dataArray.length * 3);
    const useLog = (maxVal / (minVal || 1)) > 100; // Auto-detect log scale

    const minLog = Math.log10(minVal || 1e-10);
    const rangeLog = Math.log10(maxVal) - minLog || 1;

    for (let i = 0; i < dataArray.length; i++) {
        let t = 0;
        let val = dataArray[i];

        if (useLog) {
            t = (Math.log10(val) - minLog) / rangeLog;
        } else {
            t = (val - minVal) / range;
        }

        const rgb = lerpColor(map, t);

        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
    }

    points.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    points.geometry.attributes.color.needsUpdate = true;

    showNotification(`Coloring by ${label} (${mapName.charAt(0).toUpperCase() + mapName.slice(1)})`);
}

function applyFilters() {
    if (!currentFileId) return;

    const params = new URLSearchParams();

    // Mass (log10 -> linear)
    const minM = parseFloat(document.getElementById('minMass').value);
    const maxM = parseFloat(document.getElementById('maxMass').value);
    if (!isNaN(minM)) params.append('min_mass', Math.pow(10, minM));
    if (!isNaN(maxM)) params.append('max_mass', Math.pow(10, maxM));

    // Spatial
    ['x', 'y', 'z'].forEach(axis => {
        const minVal = parseFloat(document.getElementById(`${axis}Min`).value);
        const maxVal = parseFloat(document.getElementById(`${axis}Max`).value);
        if (!isNaN(minVal)) params.append(`${axis}_min`, minVal);
        if (!isNaN(maxVal)) params.append(`${axis}_max`, maxVal);
    });

    document.getElementById('loadingOverlay').style.display = 'flex';
    loadDataAndStats(currentFileId, params.toString())
        .finally(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
        });
}

async function handleDemoLoad() {
    document.getElementById('loadingOverlay').style.display = 'flex';
    try {
        const res = await fetch(`${API_BASE_URL}/demo`, { method: 'POST' });
        if (!res.ok) throw new Error("Failed to load demo data");
        const data = await res.json();

        currentFileId = data.file_id;
        document.getElementById('fileName').textContent = data.filename;

        // Scan schema
        const scanRes = await fetch(`${API_BASE_URL}/scan/${currentFileId}`, { method: 'POST' });
        if (!scanRes.ok) throw new Error('Scan failed');
        const scanData = await scanRes.json();

        // Show modal (Schema Scanner is now smart, so defaults should be perfect)
        showSchemaModal(scanData.datasets, scanData.schema);

        // Hide overlay? No, showSchemaModal keeps it or we wait for user.
        // Usually showSchemaModal doesn't hide overlay.
        document.getElementById('loadingOverlay').style.display = 'none';

    } catch (e) {
        console.error(e);
        alert('Demo Load Error: ' + e.message);
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const demoBtn = document.getElementById('loadDemoBtn');
    if (demoBtn) {
        demoBtn.addEventListener('click', handleDemoLoad);
    }
});
