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

const CERTIFICATE_CANDIDATE_PATHS = [
    'images/eccv-best-paper-certificate.jpg',
    'images/eccv-best-paper-certificate.jpeg',
    'images/eccv-best-paper-certificate.png',
    'images/eccv-best-paper-certificate.webp',
    'images/eccv-certificate.jpg',
    'images/eccv-certificate.jpeg',
    'images/eccv-certificate.png',
    'images/certificate.jpg',
    'images/certificate.jpeg',
    'images/certificate.png'
];

let resolvedCertificateSrc = '';

function canLoadImage(src) {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = src;
    });
}

async function setupAwardCertificate() {
    const certificateImage = document.getElementById('award-certificate-image');
    const certificateButton = document.getElementById('certificate-button');
    const certificateStatus = document.getElementById('certificate-status');

    if (!certificateImage || !certificateButton || !certificateStatus) {
        return;
    }

    for (const candidate of CERTIFICATE_CANDIDATE_PATHS) {
        // Cache-bust so renamed/replaced local files are picked up immediately.
        const isAvailable = await canLoadImage(`${candidate}?v=${Date.now()}`);
        if (!isAvailable) {
            continue;
        }

        resolvedCertificateSrc = candidate;
        certificateImage.src = candidate;
        certificateImage.classList.remove('award-certificate--hidden');
        certificateButton.disabled = false;
        certificateStatus.textContent = 'Click the image or button to open full size.';
        certificateStatus.classList.remove('award-status-missing');
        return;
    }

    certificateButton.disabled = true;
    certificateStatus.textContent = 'Certificate image not found. Add it to the images folder as eccv-best-paper-certificate.jpg (or .png/.jpeg).';
    certificateStatus.classList.add('award-status-missing');
}

function showCertificate() {
    if (!resolvedCertificateSrc) {
        alert('Certificate image is missing. Add it to images/eccv-best-paper-certificate.jpg');
        return;
    }

    openModal(resolvedCertificateSrc);
}

setupAwardCertificate();

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
