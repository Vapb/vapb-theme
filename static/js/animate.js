function animate(time) {
    time = time * 0.1;
    let header = document.getElementById("welcome");
    header.style.color = 'hsl(' + time + ', 100%, 80%)';
    requestAnimationFrame(animate)
}

requestAnimationFrame(animate);
