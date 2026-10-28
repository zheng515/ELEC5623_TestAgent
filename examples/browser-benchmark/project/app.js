const nameInput = document.querySelector('#name');
const continueButton = document.querySelector('#continue');
nameInput.addEventListener('input', () => {
  const value = nameInput.value;
  continueButton.disabled = !(value.length > 3);
});
