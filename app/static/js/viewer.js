let scene, camera, renderer, points, controls;
let currentFileId = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
    // Scene Setup
    const container = document.getElementById('viewer3d');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
    camera.position.z = 100;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

    // Event Listeners
    window.addEventListener('resize', onWindowResize, false);
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('pointSize').addEventListener('input', updatePointSize);
    document.getElementById('opacity').addEventListener('input', updateOpacity);
    document.getElementById('applyFilter').addEventListener('click', applyFilters);

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

    // Accordion logic removed to allow multiple sections to be open simultaneously

    animate();
}

function onWindowResize() {
    const container = document.getElementById('viewer3d');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Required for damping
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
        // Upload
        const uploadRes = await fetch('/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const uploadData = await uploadRes.json();
        currentFileId = uploadData.file_id;

        // If H5, Scan Schema
        if (file.name.endsWith('.h5') || file.name.endsWith('.hdf5')) {
            const scanRes = await fetch(`/scan/${currentFileId}`, { method: 'POST' });
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
            const ingestRes = await fetch(`/ingest/${currentFileId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schema)
            });
            if (!ingestRes.ok) throw new Error('Ingestion failed');

            // Now load data (Note: get_data currently doesn't use the schema, 
            // so this might fail if the file structure is weird. 
            // For this demo, we assume the user just wants to see the ingestion worked)
            // Ideally we pass the schema to loadDataAndStats too.
            await loadDataAndStats(currentFileId);
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
            fetch(`/data/${fileId}?${params}`),
            fetch(`/stats/${fileId}`) // Note: Stats are currently for the full file
        ]);

        if (!dataRes.ok || !statsRes.ok) throw new Error('Failed to fetch data');

        const data = await dataRes.json();
        const stats = await statsRes.json();

        renderData(data);

        // If we have filters, we might want to update stats to reflect subset
        // For now, we update the UI with the full stats or calculate subset stats if needed
        if (params) {
            const subsetStats = {
                total_particles: data.mass.length,
                total_mass: data.mass.reduce((a, b) => a + b, 0),
                // Pass through other stats or leave them as full file stats
                // Ideally backend should handle filtered stats
                ...stats
            };
            // Override counts
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

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];

    const colorScale = new THREE.Color();
    const minMass = Math.min(...data.mass);
    const maxMass = Math.max(...data.mass);
    const massRange = maxMass - minMass || 1;

    for (let i = 0; i < data.x.length; i++) {
        vertices.push(data.x[i], data.y[i], data.z[i]);

        // Color by mass (heatmap: blue -> red)
        const normalizedMass = (data.mass[i] - minMass) / massRange;
        colorScale.setHSL(0.6 - (normalizedMass * 0.6), 1.0, 0.5);
        colors.push(colorScale.r, colorScale.g, colorScale.b);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const sprite = new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/disc.png');

    const material = new THREE.PointsMaterial({
        size: parseFloat(document.getElementById('pointSize').value),
        vertexColors: true,
        transparent: true,
        opacity: parseFloat(document.getElementById('opacity').value),
        sizeAttenuation: true,
        map: sprite,
        alphaTest: 0.5
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);

    // Center camera
    geometry.computeBoundingSphere();
    const center = geometry.boundingSphere.center;
    const radius = geometry.boundingSphere.radius;

    controls.target.copy(center);
    controls.update();

    camera.position.copy(center);
    camera.position.z += radius * 2;
    camera.lookAt(center);
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


