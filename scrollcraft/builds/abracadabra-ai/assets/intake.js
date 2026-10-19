const form = document.querySelector("form.intake");
if (form) {
  const status = form.querySelector(".intake__status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (status) status.textContent = "";
    form.querySelectorAll(".intake__error").forEach((node) => node.remove());
    let response;
    try {
      response = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json", "x-intake": "fetch" },
        body: JSON.stringify(data),
      });
    } catch (error) {
      if (status) status.textContent = "The form could not be sent. Email us and we will reply.";
      return;
    }
    if (response.status === 400) {
      const body = await response.json().catch(() => ({}));
      const field = form.querySelector(`[name="${body.field || ""}"]`);
      const note = document.createElement("p");
      note.className = "intake__error";
      note.textContent = body.message || "Check that field and try again.";
      if (field) field.insertAdjacentElement("afterend", note);
      else if (status) status.textContent = note.textContent;
      return;
    }
    if (!response.ok) {
      if (status) status.textContent = "We could not send that just now. Email us and we will reply.";
      return;
    }
    const summary = [data.need, data.budget, data.timeline].filter(Boolean).join(" · ");
    form.outerHTML = `<div class="intake__done" role="status"><h2>Got it. We reply within one working day.</h2><p>${summary}</p></div>`;
  });
}
