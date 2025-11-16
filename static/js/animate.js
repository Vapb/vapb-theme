function animate(time) {
    time = time * 0.1;
    let header = document.getElementById("MainTitle");
    header.style.color = 'hsl(' + time + ', 100%, 80%)';
    requestAnimationFrame(animate)
}

requestAnimationFrame(animate);

// Counter animation for stats
function animateCounter(element, target, duration = 2000) {
    const start = 0;
    const increment = target / (duration / 16); // 60fps
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// Intersection Observer for stats animation
const observerOptions = {
    threshold: 0.5,
    rootMargin: '0px'
};

const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Only animate .stat-number elements, not .stat-date
            const statNumbers = entry.target.querySelectorAll('.stat-number');
            statNumbers.forEach(stat => {
                const target = parseInt(stat.getAttribute('data-target'));
                if (!isNaN(target)) {
                    animateCounter(stat, target);
                }
            });

            // Show dates immediately without animation
            const statDates = entry.target.querySelectorAll('.stat-date');
            statDates.forEach(date => {
                date.style.opacity = '1';
            });

            statsObserver.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe stats when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const statsContainer = document.querySelector('.stats');
    if (statsContainer) {
        statsObserver.observe(statsContainer);
    }
});
