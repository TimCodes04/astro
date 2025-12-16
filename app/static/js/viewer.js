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
