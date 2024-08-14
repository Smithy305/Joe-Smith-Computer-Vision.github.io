// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Image Modal/Lightbox
function openModal(imageSrc) {
    const modal = document.createElement('div');
    modal.classList.add('modal-backdrop');
    
    const img = document.createElement('img');
    img.src = imageSrc;

    modal.appendChild(img);
    document.body.appendChild(modal);

    modal.addEventListener('click', function() {
        document.body.removeChild(modal);
    });
}