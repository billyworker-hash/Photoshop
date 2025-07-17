// Dynamically set sidebar height to fill zoomed viewport
function adjustSidebarHeightForZoom() {
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.style.height = (window.innerHeight / zoom) + 'px';
    }
}
window.addEventListener('resize', adjustSidebarHeightForZoom);
window.addEventListener('DOMContentLoaded', adjustSidebarHeightForZoom);
