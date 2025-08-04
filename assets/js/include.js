async function loadPartials() {
  const header = await fetch('/assets/partials/header.html');
  document.getElementById('header').innerHTML = await header.text();

  const footer = await fetch('/assets/partials/footer.html');
  document.getElementById('footer').innerHTML = await footer.text();
}
document.addEventListener("DOMContentLoaded", loadPartials);
