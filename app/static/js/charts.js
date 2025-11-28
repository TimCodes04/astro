function updateCharts(stats, data) {
    const commonLayout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Avenir, sans-serif', color: '#333' },
        margin: { t: 10, r: 10, b: 40, l: 50 },
        xaxis: { gridcolor: '#eee', zerolinecolor: '#eee' },
        yaxis: { gridcolor: '#eee', zerolinecolor: '#eee' }
    };

    // 1. Halo Mass Function (HMF)
    if (stats.mass_function) {
        const mf = stats.mass_function;
        Plotly.newPlot('hmfChart', [{
            x: mf.bin_centers.map(m => Math.log10(m)),
            y: mf.counts.map(c => Math.log10(c + 1)),
            type: 'scatter',
            mode: 'lines+markers',
            marker: { color: '#2196F3', size: 4 },
            line: { shape: 'spline', width: 2 },
            name: 'HMF'
        }], {
            ...commonLayout,
            xaxis: { ...commonLayout.xaxis, title: 'log10(Mass [M☉])' },
            yaxis: { ...commonLayout.yaxis, title: 'log10(Count)' }
        }, { responsive: true, displayModeBar: false });
    }

    // 2. Cumulative HMF
    if (stats.cumulative_mass_function && stats.cumulative_mass_function.bin_centers && stats.cumulative_mass_function.counts) {
        const cmf = stats.cumulative_mass_function;
        Plotly.newPlot('cumulativeHmfChart', [{
            x: cmf.bin_centers.map(m => Math.log10(m)),
            y: cmf.counts.map(c => Math.log10(c + 1)), // +1 to handle zeros safely
            type: 'scatter',
            mode: 'lines',
            line: { color: '#FF9800', width: 2 },
            fill: 'tozeroy',
            name: 'N(>M)'
        }], {
            ...commonLayout,
            xaxis: { ...commonLayout.xaxis, title: 'log10(Mass [M☉])' },
            yaxis: { ...commonLayout.yaxis, title: 'log10(N > M)' }
        }, { responsive: true, displayModeBar: false });
    } else {
        console.warn("Cumulative HMF data missing or incomplete. Keys:", stats.cumulative_mass_function ? Object.keys(stats.cumulative_mass_function) : "stats.cumulative_mass_function is undefined");
        document.getElementById('cumulativeHmfChart').innerHTML = '<div class="placeholder-text">No Data</div>';
    }

    // 3. Radius Histogram
    if (stats.radius_histogram) {
        const rh = stats.radius_histogram;
        Plotly.newPlot('radiusChart', [{
            x: rh.bin_centers,
            y: rh.counts,
            type: 'bar',
            marker: { color: '#4CAF50' },
            name: 'Radius'
        }], {
            ...commonLayout,
            xaxis: { ...commonLayout.xaxis, title: 'Radius [kpc]' },
            yaxis: { ...commonLayout.yaxis, title: 'Count' }
        }, { responsive: true, displayModeBar: false });
    }

    // 4. Mass vs Radius Scatter
    if (data && data.mass && data.radius) {
        // Downsample if too many points for performance
        let x = data.radius;
        let y = data.mass.map(m => Math.log10(m));

        if (x.length > 2000) {
            const step = Math.floor(x.length / 2000);
            x = x.filter((_, i) => i % step === 0);
            y = y.filter((_, i) => i % step === 0);
        }

        Plotly.newPlot('scatterChart', [{
            x: x,
            y: y,
            type: 'scatter',
            mode: 'markers',
            marker: { color: '#9C27B0', size: 3, opacity: 0.6 },
            name: 'M-R'
        }], {
            ...commonLayout,
            xaxis: { ...commonLayout.xaxis, title: 'Radius [kpc]' },
            yaxis: { ...commonLayout.yaxis, title: 'log10(Mass [M☉])' }
        }, { responsive: true, displayModeBar: false });
    } else {
        document.getElementById('scatterChart').innerHTML = '<p style="text-align:center; padding-top:20px; color:#999;">No Radius Data</p>';
    }
}

// Expose to window
window.updateCharts = updateCharts;
