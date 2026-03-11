// Smooth scrolling with sticky-nav offset
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (!targetId || targetId === '#') {
            return;
        }

        const target = document.querySelector(targetId);
        if (!target) {
            return;
        }

        e.preventDefault();

        const nav = document.querySelector('nav');
        const navOffset = nav ? nav.offsetHeight + 10 : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - navOffset;

        window.scrollTo({
            top,
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
