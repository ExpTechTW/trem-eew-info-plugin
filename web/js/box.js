const container = document.querySelector(".container");
let draggedItem = null;

document.querySelectorAll(".info-box").forEach((box) => {
  box.addEventListener("dragstart", function (e) {
    draggedItem = this;
    setTimeout(() => this.classList.add("dragging"), 0);
  });

  box.addEventListener("dragend", function () {
    this.classList.remove("dragging");
    draggedItem = null;
  });
});

container.addEventListener("dragover", function (e) {
  e.preventDefault();
  if (!draggedItem) return;

  const afterElement = getDragAfterElement(container, e.clientY, e.clientX);
  const draggable = document.querySelector(".dragging");

  if (afterElement == null) {
    container.appendChild(draggable);
  } else {
    container.insertBefore(draggable, afterElement);
  }
});

function getDragAfterElement(container, y, x) {
  const draggableElements = [
    ...container.querySelectorAll(".info-box:not(.dragging)"),
  ];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}
