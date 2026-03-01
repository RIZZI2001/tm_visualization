// ============================================================================
// Info Handler
// ============================================================================

let infoOverlay = null;

function initInfoHandler() {
    const infoBtn = document.getElementById('info-btn');
    if (infoBtn) {
        infoBtn.addEventListener('click', createInfoOverlay);
    }
}

function createInfoOverlay() {
    // Create content area
    const content = document.createElement('div');
    content.className = 'info-content';
    
    // Add info content
    const title = document.createElement('h3');
    title.textContent = 'HeaTMapper';
    content.appendChild(title);
    
    const description = document.createElement('p');
    description.textContent = "This tool makes interactive analysis of topic models possible. Topic models are statistical models that find latent pattersn within large data sets. This makes it easier to find relevant changes over time or place in datasets, which would be hard to analyse otherwise. The single topics describe combined abundance of microorganisms. Hover your mouse over the labels on the left to expand the rows and analyse the topics in more detail. To get information about the topics, click the expanded rows. You can find sublementary info, like metadata in the linegraphs.";
    content.appendChild(description);
    
    infoOverlay = createOverlay('info-overlay', 'Information', content, null, closeInfoOverlay);
    document.body.appendChild(infoOverlay);
}

function closeInfoOverlay() {
    if (infoOverlay) {
        infoOverlay.remove();
        infoOverlay = null;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initInfoHandler);
