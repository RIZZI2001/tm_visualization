// Sidebar Toggle Handler
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

  // Close panels when clicking on chart area
  const chartContainer = document.getElementById('chart-container');
  if (chartContainer) {
    chartContainer.addEventListener('click', function() {
      leftPanel.classList.remove('expanded');
      rightPanel.classList.remove('expanded');
    });
  }
});
