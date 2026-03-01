// ============================================================================
// Info Handler
// ============================================================================

let itscOverlay = null;

function initITSC_Handler() {
    const itscBtn = document.getElementById('inter-top-btn');
    if (itscBtn) {
        itscBtn.addEventListener('click', createITSC_Overlay);
    }
}

async function createITSC_Overlay() {
    const content = document.createElement('div');
    content.className = 'itsc-content';

    // Create container for both heatmaps
    const heatmapContainer = document.createElement('div');
    heatmapContainer.className = 'itsc-heatmap-container';
    heatmapContainer.style.width = '100%';
    heatmapContainer.style.height = '100%';
    heatmapContainer.style.display = 'flex';
    heatmapContainer.style.justifyContent = 'center';
    heatmapContainer.style.alignItems = 'center';
    content.appendChild(heatmapContainer);

    // Fetch both heatmaps
    const heatmaps = [];
    for (const offset of [-1, 1]) {
        try {
            const itscPayload = generateITSCPayload(TOPIC_SET, TOPIC_SET + offset);
            const resp = await fetchCSVData(itscPayload);
            
            if (resp && resp.csv) {
                let rows = parseAndValidateCSV(resp.csv);
                if(rows.length - 1 != TOPIC_SET) {
                    rows = transpose(rows);
                }
                heatmaps.push(rows);
            }
        } catch (error) {
            // Skip this heatmap if it doesn't exist or fails to load
            console.warn(`Failed to load heatmap with offset ${offset}:`, error);
        }
    }

    if (heatmaps.length > 0) {
        createDualHeatmap(heatmaps, heatmapContainer);
    } else {
        heatmapContainer.innerHTML = '<p style="color: #999;">No inter-topicset correlation data available</p>';
    }
    
    itscOverlay = createOverlay('itsc-overlay', `Inter-Topic-Set-Correlation: Topic set ${TOPIC_SET}`, content, null, closeITSCOverlay, '95vw', '75vh');
    document.body.appendChild(itscOverlay);
}

function createDualHeatmap(heatmapsArray, container) {
    if (!heatmapsArray || heatmapsArray.length === 0 || !container) return;

    const hm1 = heatmapsArray[0];
    const hm2 = heatmapsArray.length > 1 ? heatmapsArray[1] : null;
    
    if (!hm1) return;

    const colLabels1 = hm1[0].slice(1);
    const colLabels2 = hm2 ? hm2[0].slice(1) : [];
    const rowLabels = hm1.slice(1).map(r => r[0]);
    
    // Get values for unified color scale
    const values = [];
    const matrix1 = hm1.slice(1).map(row => 
        row.slice(1).map(v => {
            const parsed = parseFloat(v);
            if (!isNaN(parsed)) values.push(parsed);
            return parsed;
        })
    );
    const matrix2 = hm2 ? hm2.slice(1).map(row => 
        row.slice(1).map(v => {
            const parsed = parseFloat(v);
            if (!isNaN(parsed)) values.push(parsed);
            return parsed;
        })
    ) : [];

    if (values.length === 0) return;

    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    const colorScale = createColorScale(vmin, vmax, SPECS.topicColorScale, 'linear');

    const colCount1 = colLabels1.length;
    const colCount2 = colLabels2.length;
    const rowCount = rowLabels.length;
    const cellSize = 350 / TOPIC_SET;
    const labelWidth = 100;
    const topLabelHeight = 60;
    const headingHeight = 25;
    
    const grid1Width = colCount1 * cellSize;
    const totalWidth = hm2 ? (grid1Width + labelWidth + colCount2 * cellSize) : grid1Width;
    const totalHeight = rowCount * cellSize + topLabelHeight + headingHeight;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    svg.style.maxWidth = '100%';
    svg.style.maxHeight = '100%';

    // Helper function to render heatmap cells
    function renderHeatmapCells(matrix, xOffset, colCount) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${xOffset}, ${headingHeight + topLabelHeight})`);
        svg.appendChild(g);

        for (let row = 0; row < rowCount; row++) {
            for (let col = 0; col < colCount; col++) {
                const val = matrix[row][col];
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', col * cellSize);
                rect.setAttribute('y', row * cellSize);
                rect.setAttribute('width', cellSize);
                rect.setAttribute('height', cellSize);
                rect.setAttribute('fill', !isNaN(val) ? colorScale(val) : '#999');
                rect.setAttribute('stroke', 'none');
                
                rect.addEventListener('mouseenter', (e) => {
                    const tooltip = document.createElement('div');
                    tooltip.style.cssText = 'position:fixed;background:rgba(0,0,0,0.9);color:white;padding:6px 10px;border-radius:3px;font-size:12px;font-family:monospace;pointer-events:none;z-index:10000';
                    tooltip.textContent = `T${rowLabels[row]} ↔ T${col}: ${(!isNaN(val) ? val.toFixed(4) : 'N/A')}`;
                    tooltip.style.left = e.clientX + 8 + 'px';
                    tooltip.style.top = e.clientY + 8 + 'px';
                    document.body.appendChild(tooltip);
                    rect._tooltip = tooltip;
                });

                rect.addEventListener('mousemove', (e) => {
                    if (rect._tooltip) {
                        rect._tooltip.style.left = e.clientX + 8 + 'px';
                        rect._tooltip.style.top = e.clientY + 8 + 'px';
                    }
                });

                rect.addEventListener('mouseleave', () => {
                    if (rect._tooltip) {
                        rect._tooltip.remove();
                        rect._tooltip = null;
                    }
                });

                g.appendChild(rect);
            }
        }
    }

    // Helper function to render column labels with 90° rotation
    function renderColumnLabels(xStart, colCount) {
        const fontSize = Math.max(8, Math.min(12, 150 / Math.max(rowCount, colCount)));
        for (let col = 0; col < colCount; col++) {
            const x = xStart + col * cellSize + cellSize / 2;
            const y = headingHeight + topLabelHeight - 10;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'start');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', fontSize);
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('fill', '#000');
            text.setAttribute('transform', `rotate(-90 ${x} ${y})`);
            text.textContent = (TOPIC_NAMES[colCount] && TOPIC_NAMES[colCount][col]) || `Topic ${col}`;
            svg.appendChild(text);
        }
    }

    // Helper function to render heading
    function renderHeading(xStart, colCount) {
        const headingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const x = xStart + (colCount * cellSize) / 2;
        const y = 18;
        headingText.setAttribute('x', x);
        headingText.setAttribute('y', y);
        headingText.setAttribute('text-anchor', 'middle');
        headingText.setAttribute('dominant-baseline', 'middle');
        headingText.setAttribute('font-size', '14');
        headingText.setAttribute('font-weight', 'bold');
        headingText.setAttribute('fill', '#333');
        headingText.textContent = `Topic set ${colCount}`;
        svg.appendChild(headingText);
    }

    // Render heatmap 1
    renderHeading(0, colCount1);
    renderHeatmapCells(matrix1, 0, colCount1);
    renderColumnLabels(0, colCount1);

    // Render heatmap 2 if it exists
    if (hm2) {
        const xOffset2 = grid1Width + labelWidth;
        renderHeading(xOffset2, colCount2);
        renderHeatmapCells(matrix2, xOffset2, colCount2);
        renderColumnLabels(xOffset2, colCount2);
    }

    // Row labels (always display)
    const fontSize = Math.max(8, Math.min(12, 150 / Math.max(rowCount, colCount1, colCount2)));
    for (let row = 0; row < rowCount; row++) {
        const x = grid1Width + labelWidth / 2;
        const y = headingHeight + topLabelHeight + row * cellSize + cellSize / 2;
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', fontSize);
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#000');
        text.textContent = (TOPIC_NAMES[TOPIC_SET] && TOPIC_NAMES[TOPIC_SET][row]) || `Topic ${row}`;
        svg.appendChild(text);
    }

    container.appendChild(svg);
}

function generateITSCPayload(ts1, ts2) {
    const tsb = ts1 < ts2 ? ts2 : ts1;
    const tss = ts1 < ts2 ? ts1 : ts2;
    return {
        "file": `Output/${DATA_SET}/Correlation/top_top_inter/${tsb}_${tss}_inter_top_correlation.csv`,
        "data_set": `${DATA_SET}`,
        "table_type": "top_top",
        "specs": {
            "id": {
                "type": "all",
                "value": [],
                "average": "false"
            },
            "attribute": {
                "type": "all",
                "value": [],
                "average": "false"
            }
        }
    };
}

function closeITSCOverlay() {
    if (itscOverlay) {
        itscOverlay.remove();
        itscOverlay = null;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initITSC_Handler);
