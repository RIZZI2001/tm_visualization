// Sidepanel Toggle Handler
document.addEventListener('DOMContentLoaded', function() {
    const leftHandle = document.querySelector('.left-handle');
    const rightHandle = document.querySelector('.right-handle');
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');

    // Left panel toggle
    if (leftHandle && leftPanel) {
        leftHandle.addEventListener('click', function(e) {
            e.stopPropagation();
            leftPanel.classList.toggle('expanded');
        });
    }

    // Right panel toggle
    if (rightHandle && rightPanel) {
        rightHandle.addEventListener('click', function(e) {
            e.stopPropagation();
            rightPanel.classList.toggle('expanded');
        });
    }
});

/**
 * Create basic panel structure with title and All/None buttons
 * @param {string} sectionId - The container section ID
 * @param {string} title - Panel title text
 * @returns {Object} { container, list, allBtn, noneBtn }
 */
function createPanelStructure(sectionId, title) {
    const container = document.getElementById(sectionId);
    if (!container) return null;
    
    container.innerHTML = '';
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    container.appendChild(titleEl);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginBottom = '10px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.className = 'header-btn';
    buttonContainer.appendChild(allBtn);
    
    const noneBtn = document.createElement('button');
    noneBtn.textContent = 'None';
    noneBtn.className = 'header-btn';
    buttonContainer.appendChild(noneBtn);
    
    container.appendChild(buttonContainer);

    const list = document.createElement('div');
    list.className = 'panel-list';
    container.appendChild(list);

    return { container, list, allBtn, noneBtn };
}

/**
 * Create a checkbox item for the panel list
 * @param {string} label - Display label
 * @param {string|number} identifier - Data identifier (stored in dataset.identifier)
 * @param {boolean} isChecked - Whether checkbox is checked
 * @returns {HTMLDivElement} Panel item element
 */
function createCheckboxItem(label, identifier, isChecked = false) {
    const item = document.createElement('div');
    item.className = 'panel-item';
    
    const text = document.createElement('span');
    text.textContent = label;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'panel-checkbox';
    checkbox.checked = isChecked;
    checkbox.dataset.identifier = identifier;
    
    item.appendChild(text);
    item.appendChild(checkbox);
    return item;
}

/**
 * Populate the Topic Selection panel with checkboxes and All/None buttons
 */
function populateTopicSelectionPanel() {
    const topicIds = Array.from({length: TOPIC_SET}, (_, i) => i);
    try {
        const panel = createPanelStructure('topic-selection-section', 'Topic Selection');
        if (!panel) return;

        topicIds.forEach((lbl, idx) => {
            const isChecked = ACTIVE_TOPICS_MAIN.includes(idx);
            const item = createCheckboxItem(nameOfTopic(lbl), idx, isChecked);
            panel.list.appendChild(item);
        });

        // Listen for checkbox changes
        panel.list.addEventListener('change', (ev) => {
            const t = ev.target;
            if (!t || !t.matches || !t.matches('input.panel-checkbox')) return;
            const idx = parseInt(t.dataset.identifier, 10);
            const checked = !!t.checked;

            let activeTopics = CURRENT_VIEW == 'main' ? ACTIVE_TOPICS_MAIN : ACTIVE_ELEMENTS_DETAIL;
            
            if (checked) {
                if (!activeTopics.includes(idx)) {
                    activeTopics.push(idx);
                    activeTopics.sort((a, b) => a - b);
                }
            } else {
                const pos = activeTopics.indexOf(idx);
                if (pos >= 0) activeTopics.splice(pos, 1);
            }
            // Update localStorage for main view
            if(CURRENT_VIEW == 'main') {
                localStorage.setItem('ACTIVE_TOPICS_MAIN', JSON.stringify(ACTIVE_TOPICS_MAIN));
            } else if(CURRENT_VIEW == 'topic') {
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }

            if(CURRENT_VIEW == 'main') {
                try {
                    const rg = rowGroups.nodes()[idx];
                    if (rg) rg.style.display = checked ? null : 'none';
                    if (yLabelGroups) { 
                        const lg = yLabelGroups.nodes()[idx]; 
                        if (lg) lg.style.display = checked ? null : 'none'; 
                    }
                } catch (e) { }
                applyActiveTopicsLayout(true);
            } else if(CURRENT_VIEW == 'topic') {
                showDetailView('topic', false, activeTopics);
            }
        });

        // Right-click listener for topic checkboxes
        panel.list.addEventListener('contextmenu', (ev) => {
            const t = ev.target;
            if (!t || !t.matches || !t.matches('input.panel-checkbox')) return;
            ev.preventDefault();
            
            const idx = parseInt(t.dataset.identifier, 10);
            const checkboxes = panel.list.querySelectorAll('input.panel-checkbox');
            
            let activeTopics = CURRENT_VIEW == 'main' ? ACTIVE_TOPICS_MAIN : ACTIVE_ELEMENTS_DETAIL;
            activeTopics.length = 0;
            checkboxes.forEach((cb) => cb.checked = false);
            activeTopics.push(idx);
            t.checked = true;

            // Update localStorage for main view
            if(CURRENT_VIEW == 'main') {
                localStorage.setItem('ACTIVE_TOPICS_MAIN', JSON.stringify(ACTIVE_TOPICS_MAIN));
            } else if(CURRENT_VIEW == 'topic') {
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }
            
            if(CURRENT_VIEW == 'main') {
                rowGroups.nodes().forEach((rg, i) => {
                    if (rg) rg.style.display = (i === idx) ? null : 'none';
                });
                try {
                    if (yLabelGroups) { 
                        yLabelGroups.nodes().forEach((lg, i) => {
                            if (lg) lg.style.display = (i === idx) ? null : 'none'; 
                        });
                    }
                } catch (e) { }
                applyActiveTopicsLayout(true);
            } else if(CURRENT_VIEW == 'topic') {
                showDetailView('topic', false, activeTopics);
            }
        });

        // "All" button handler
        panel.allBtn.addEventListener('click', () => {
            if(CURRENT_VIEW == 'main') {
                ACTIVE_TOPICS_MAIN = topicIds.map((_, idx) => idx);
                localStorage.setItem('ACTIVE_TOPICS_MAIN', JSON.stringify(ACTIVE_TOPICS_MAIN));
            } else if(CURRENT_VIEW == 'topic') {
                ACTIVE_ELEMENTS_DETAIL = topicIds.map((_, idx) => idx);
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }
            setCheckboxesTo('topic', CURRENT_VIEW == 'main' ? ACTIVE_TOPICS_MAIN : ACTIVE_ELEMENTS_DETAIL);
            if(CURRENT_VIEW === 'topic') showDetailView('topic', false, ACTIVE_ELEMENTS_DETAIL);
        });

        // "None" button handler
        panel.noneBtn.addEventListener('click', () => {
            if(CURRENT_VIEW == 'main') {
                ACTIVE_TOPICS_MAIN = [];
                localStorage.setItem('ACTIVE_TOPICS_MAIN', JSON.stringify(ACTIVE_TOPICS_MAIN));
            } else if(CURRENT_VIEW == 'topic') {
                ACTIVE_ELEMENTS_DETAIL = [];
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }
            setCheckboxesTo('topic', CURRENT_VIEW == 'main' ? ACTIVE_TOPICS_MAIN : ACTIVE_ELEMENTS_DETAIL);
            if(CURRENT_VIEW === 'topic') showDetailView('topic', false, ACTIVE_ELEMENTS_DETAIL);
        });
    } catch (e) { /* ignore */ }
}

function setCheckboxesTo(type, checkedItems) {
    let list;
    if(type === 'topic') {
        list = document.querySelector('#topic-selection-section .panel-list');
    } else if (type === 'metadata') {
        list = document.querySelector('#metadata-selection-section .panel-list');
    }
    const checkboxes = list.querySelectorAll('input.panel-checkbox');
    
    // For metadata in main view, track what was previously checked before updating
    let previouslyChecked = [];
    if(type === 'metadata' && CURRENT_VIEW == 'main') {
        previouslyChecked = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.identifier);
    }
    
    checkboxes.forEach((checkbox) => {
        checkbox.checked = (checkedItems.includes(checkbox.dataset.identifier) || checkedItems.includes(parseInt(checkbox.dataset.identifier, 10)));
    });

    // Only update rowGroups for topic selection (main view only)
    if(type === 'topic' && typeof rowGroups !== 'undefined') {
        rowGroups.nodes().forEach((rg, idx) => {
            if (rg) rg.style.display = checkedItems.includes(idx) ? null : 'none';
        });
        try {
            if (yLabelGroups) {
                yLabelGroups.nodes().forEach((lg, idx) => {
                    if (lg) lg.style.display = checkedItems.includes(idx) ? null : 'none';
                });
            }
        } catch (e) { }
        
        if(CURRENT_VIEW == 'main') {
            applyActiveTopicsLayout(true);
        }
    } else if(type === 'metadata' && CURRENT_VIEW == 'main') {
        // Update linegraph with added and removed attributes
        const toAdd = checkedItems.filter(item => !previouslyChecked.includes(item));
        const toRemove = previouslyChecked.filter(item => !checkedItems.includes(item));
        
        // Remove old attributes
        toRemove.forEach(name => {
            try {
                removeLineGraphAttribute(name);
            } catch (e) { console.error(e); }
        });
        
        // Add new attributes using batch
        if (toAdd.length > 0 && window && typeof window.addLineGraphAttributesBatch === 'function') {
            try {
                window.addLineGraphAttributesBatch(toAdd);
            } catch (e) { console.error(e); }
        }
    }
}

function setSelectionPanelActive(container, active) {
    if (!container) return;
    
    if(active) {
        container.style.pointerEvents = 'auto';
        container.style.opacity = '1.0';
    } else {
        container.style.pointerEvents = 'none';
        container.style.opacity = '0.5';
    }
}


/**
 * Populate the Metadata Selection panel with checkboxes and All/None buttons
 */
function populateMetadataSelectionPanel() {
    try {
        const opts = SPECS.metadataOptions;
        const panel = createPanelStructure('metadata-selection-section', 'Metadata Selection');
        if (!panel) return;

        opts.forEach((opt) => {
            const isChecked = ACTIVE_METADATA_MAIN.includes(opt);
            const item = createCheckboxItem(opt, opt, isChecked);
            panel.list.appendChild(item);
        });

        // Listen for checkbox changes
        panel.list.addEventListener('change', async (ev) => {
            const t = ev.target;
            if (!t || !t.matches || !t.matches('input.panel-checkbox')) return;
            const name = t.dataset.identifier;
            if (!name) return;
            const checked = !!t.checked;

            // Directly update ACTIVE_METADATA_MAIN or ACTIVE_ELEMENTS_DETAIL
            if(CURRENT_VIEW == 'main') {
                if (checked) {
                    if (!ACTIVE_METADATA_MAIN.includes(name)) ACTIVE_METADATA_MAIN.push(name);
                } else {
                    const pos = ACTIVE_METADATA_MAIN.indexOf(name);
                    if (pos >= 0) ACTIVE_METADATA_MAIN.splice(pos, 1);
                }
                localStorage.setItem('ACTIVE_METADATA_MAIN', JSON.stringify(ACTIVE_METADATA_MAIN));
            } else if(CURRENT_VIEW == 'metadata') {
                if (checked) {
                    if (!ACTIVE_ELEMENTS_DETAIL.includes(name)) ACTIVE_ELEMENTS_DETAIL.push(name);
                } else {
                    const pos = ACTIVE_ELEMENTS_DETAIL.indexOf(name);
                    if (pos >= 0) ACTIVE_ELEMENTS_DETAIL.splice(pos, 1);
                }
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }

            if(CURRENT_VIEW == 'main') {
                try {
                    if (checked) {
                        await addLineGraphAttribute(name);
                    } else {
                        removeLineGraphAttribute(name);
                    }
                } catch (e) { console.error('[Metadata Checkbox] Error:', e); }
            } else if(CURRENT_VIEW == 'metadata') {
                showDetailView('metadata', false, ACTIVE_ELEMENTS_DETAIL);
            }
        });

        // Right-click listener for metadata checkboxes
        panel.list.addEventListener('contextmenu', (ev) => {
            const t = ev.target;
            if (!t || !t.matches || !t.matches('input.panel-checkbox')) return;
            ev.preventDefault();
            
            const name = t.dataset.identifier;
            if (!name) return;
            
            const checkboxes = panel.list.querySelectorAll('input.panel-checkbox');
            let activeMetadata = CURRENT_VIEW == 'main' ? ACTIVE_METADATA_MAIN : ACTIVE_ELEMENTS_DETAIL;
            
            activeMetadata.length = 0;
            checkboxes.forEach((cb) => cb.checked = false);
            activeMetadata.push(name);
            t.checked = true;

            // Update localStorage for main view
            if(CURRENT_VIEW == 'main') {
                localStorage.setItem('ACTIVE_METADATA_MAIN', JSON.stringify(ACTIVE_METADATA_MAIN));
            } else if(CURRENT_VIEW == 'metadata') {
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }
            
            if(CURRENT_VIEW == 'main') {
                try {
                    const toRemove = [];
                    checkboxes.forEach((cb) => {
                        const cbName = cb.dataset.identifier;
                        if (cbName !== name) toRemove.push(removeLineGraphAttribute(cbName));
                    });
                    addLineGraphAttribute(name);
                } catch (e) { console.error(e); }
            } else if(CURRENT_VIEW == 'metadata') {
                showDetailView('metadata', false, activeMetadata);
            }
        });

        // "All" button handler
        panel.allBtn.addEventListener('click', async () => {
            if(CURRENT_VIEW == 'main') {
                ACTIVE_METADATA_MAIN = opts.slice();
                localStorage.setItem('ACTIVE_METADATA_MAIN', JSON.stringify(ACTIVE_METADATA_MAIN));
            } else if(CURRENT_VIEW == 'metadata') {
                ACTIVE_ELEMENTS_DETAIL = opts.slice();
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }
            setCheckboxesTo('metadata', CURRENT_VIEW == 'main' ? ACTIVE_METADATA_MAIN : ACTIVE_ELEMENTS_DETAIL);
            if(CURRENT_VIEW === 'metadata') showDetailView('metadata', false, ACTIVE_ELEMENTS_DETAIL);
            if(CURRENT_VIEW === 'main') await updateLineGraphs();
        });

        // "None" button handler
        panel.noneBtn.addEventListener('click', async () => {
            console.log(`[Metadata None] Clicked, CURRENT_VIEW=${CURRENT_VIEW}`);
            if(CURRENT_VIEW == 'main') {
                ACTIVE_METADATA_MAIN = [];
                localStorage.setItem('ACTIVE_METADATA_MAIN', JSON.stringify(ACTIVE_METADATA_MAIN));
                console.log(`[Metadata None] ACTIVE_METADATA_MAIN set to:`, ACTIVE_METADATA_MAIN);
            } else if(CURRENT_VIEW == 'metadata') {
                ACTIVE_ELEMENTS_DETAIL = [];
                localStorage.setItem('ACTIVE_ELEMENTS_DETAIL', JSON.stringify(ACTIVE_ELEMENTS_DETAIL));
            }
            setCheckboxesTo('metadata', CURRENT_VIEW == 'main' ? ACTIVE_METADATA_MAIN : ACTIVE_ELEMENTS_DETAIL);
            console.log(`[Metadata None] Called setCheckboxesTo, about to call updateLineGraphs`);
            if(CURRENT_VIEW === 'metadata') showDetailView('metadata', false, ACTIVE_ELEMENTS_DETAIL);
            if(CURRENT_VIEW === 'main') {
                console.log(`[Metadata None] Calling updateLineGraphs`);
                await updateLineGraphs();
                console.log(`[Metadata None] updateLineGraphs completed`);
            }
        });
    } catch (e) { }
}


/**
 * Populate the Site Selection panel with checkboxes and All/None buttons
 * Uses pre-loaded SITE_NAMES and ACTIVE_SITES from app.js
 */
function populateSiteSelectionPanel() {
    try {
        const panel = createPanelStructure('site-selection-section', 'Site Selection');
        if (!panel) return;

        ALL_SITES.forEach((siteId) => {
            const siteLabel = (SPECS && SPECS.showPlaceNameLabels) ? SITE_NAMES[siteId - 1] : `Site ${siteId}`;
            const isChecked = ACTIVE_SITES.includes(siteId);
            const item = createCheckboxItem(siteLabel, siteId, isChecked);
            panel.list.appendChild(item);
        });

        // Event listener to update ACTIVE_SITES when checkbox changes
        panel.list.addEventListener('change', async (e) => {
            const checkbox = e.target;
            if (!checkbox.matches('input.panel-checkbox')) return;
            
            const siteId = parseInt(checkbox.dataset.identifier);
            if (checkbox.checked) {
                if (!ACTIVE_SITES.includes(siteId)) {
                    ACTIVE_SITES.push(siteId);
                    setPlaceSpacingAndOrder();
                }
            } else {
                const idx = ACTIVE_SITES.indexOf(siteId);
                if (idx > -1) ACTIVE_SITES.splice(idx, 1);
            }

            localStorage.setItem('ACTIVE_SITES', JSON.stringify(ACTIVE_SITES));
            
            if(CURRENT_VIEW === 'main') {
                initializeMainView();
            } else if(CURRENT_VIEW === 'topic' || CURRENT_VIEW === 'otu' || CURRENT_VIEW === 'metadata') {
                if(DETAIL_MAP_MODE === null) {
                    await createDetailViewGrid();
                } else {
                    await openMap();
                }
            }
        });
        
        // Right-click listener for site checkboxes
        panel.list.addEventListener('contextmenu', async (e) => {
            if (!e.target.matches('input.panel-checkbox')) return;
            e.preventDefault();
            
            const siteId = parseInt(e.target.dataset.identifier);
            const checkboxes = panel.list.querySelectorAll('input.panel-checkbox');
            
            checkboxes.forEach((cb) => {
                const cbSiteId = parseInt(cb.dataset.identifier);
                cb.checked = (cbSiteId === siteId);
            });
            
            ACTIVE_SITES = [siteId];
            localStorage.setItem('ACTIVE_SITES', JSON.stringify(ACTIVE_SITES));
            
            if(CURRENT_VIEW === 'main') {
                initializeMainView();
            } else if(CURRENT_VIEW === 'topic' || CURRENT_VIEW === 'otu' || CURRENT_VIEW === 'metadata') {
                if(DETAIL_MAP_MODE === null) {
                    await createDetailViewGrid();
                } else {
                    await openMap();
                }
            }
        });

        // "All" button handler
        panel.allBtn.addEventListener('click', async () => {
            const checkboxes = panel.list.querySelectorAll('input.panel-checkbox');
            ACTIVE_SITES = [];
            checkboxes.forEach((checkbox) => {
                checkbox.checked = true;
                const siteId = parseInt(checkbox.dataset.identifier);
                if (!ACTIVE_SITES.includes(siteId)) {
                    ACTIVE_SITES.push(siteId);
                }
            });
            setPlaceSpacingAndOrder();
            localStorage.setItem('ACTIVE_SITES', JSON.stringify(ACTIVE_SITES));
            if(CURRENT_VIEW === 'main') {
                initializeMainView();
            } else if(CURRENT_VIEW === 'topic' || CURRENT_VIEW === 'otu' || CURRENT_VIEW === 'metadata') {
                if(DETAIL_MAP_MODE === null) {
                    await createDetailViewGrid();
                } else {
                    await openMap();
                }
            }
        });

        // "None" button handler
        panel.noneBtn.addEventListener('click', async () => {
            const checkboxes = panel.list.querySelectorAll('input.panel-checkbox');
            ACTIVE_SITES = [];
            checkboxes.forEach((checkbox) => {
                checkbox.checked = false;
            });
            localStorage.setItem('ACTIVE_SITES', JSON.stringify(ACTIVE_SITES));
            if(CURRENT_VIEW === 'main') {
                initializeMainView();
            } else if(CURRENT_VIEW === 'topic' || CURRENT_VIEW === 'otu' || CURRENT_VIEW === 'metadata') {
                if(DETAIL_MAP_MODE === null) {
                    await createDetailViewGrid();
                } else {
                    await openMap();
                }
            }
        });
    } catch (e) { console.error('Error populating site selection panel:', e); }
}