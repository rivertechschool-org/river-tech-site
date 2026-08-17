/* River Tech — Performing Arts 2026-27 choices — form logic
   One submission per FAMILY. Parent details once, then a card per student,
   added and removed with buttons. The backend writes one sheet row per child.
   No payment.

   Age bands (set by Dan 2026-08-16):
     6-8   → no arts choice question; show the youngest-students note
     9-10  → dance or instruments
     11+   → dance, ukulele and guitar, or piano

   Each card branches on its own age, independently of the others. */
(function () {
  "use strict";

  // ---- Configuration ----------------------------------------------------
  const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxygFbe4_QSx9-Y4qHzRlILGxpaEaWXmKG2oykF-x5iZ3sAt_8n3FYM-xbiILfvRz6FCg/exec";
  const SCHOOL_YEAR = "2026-27";
  const MAX_STUDENTS = 6;

  let counter = 0;

  // ---- Boot -------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("pa-add-student").addEventListener("click", function () { addStudent(); });
    document.getElementById("pa-form").addEventListener("submit", submitForm);
    addStudent(); // start with one
  });

  // ---- Student cards ----------------------------------------------------
  function addStudent() {
    const list = document.getElementById("pa-student-list");
    if (list.children.length >= MAX_STUDENTS) return;

    counter += 1;
    const id = "s" + counter;
    const card = document.createElement("div");
    card.className = "pa-student";
    card.dataset.sid = id;
    card.innerHTML = cardHtml(id);
    list.appendChild(card);

    wireCard(card);
    renumber();
    updateAddButton();
  }

  function removeStudent(card) {
    const list = document.getElementById("pa-student-list");
    if (list.children.length <= 1) {
      // Never leave the family with no student — clear the card instead.
      card.querySelectorAll("input[type=text], select, textarea").forEach(function (el) { el.value = ""; });
      card.querySelectorAll("input[type=radio]").forEach(function (r) {
        r.checked = false;
        const lbl = r.closest(".reg-check");
        if (lbl) lbl.classList.remove("checked");
      });
      applyBand(card);
      renumber();
      return;
    }
    card.remove();
    renumber();
    updateAddButton();
  }

  function updateAddButton() {
    const list = document.getElementById("pa-student-list");
    const btn = document.getElementById("pa-add-student");
    const full = list.children.length >= MAX_STUDENTS;
    btn.classList.toggle("pa-hidden", full);
  }

  function cardHtml(id) {
    let ages = '<option value="">Age…</option>';
    for (let a = 6; a <= 18; a++) { ages += '<option value="' + a + '">' + a + "</option>"; }

    return [
      '<div class="pa-student-head">',
      '  <span class="pa-student-title" data-title>Student 1</span>',
      '  <button type="button" class="pa-remove" data-action="remove">Remove</button>',
      '</div>',

      '<div class="reg-row-grid-name-age">',
      '  <div>',
      '    <label class="reg-label">Student\'s name<span class="req">*</span></label>',
      '    <input class="reg-input" type="text" data-field="name" placeholder="First and last name" required>',
      '  </div>',
      '  <div>',
      '    <label class="reg-label">Age<span class="req">*</span></label>',
      '    <select class="reg-select" data-field="age" required>' + ages + '</select>',
      '  </div>',
      '</div>',

      '<div class="reg-row">',
      '  <label class="reg-label">Will they join our performances this year?<span class="req">*</span></label>',
      '  <div class="reg-choices inline">',
      '    <label class="reg-check"><input type="radio" name="join_' + id + '" value="Yes"><span>Yes</span></label>',
      '    <label class="reg-check"><input type="radio" name="join_' + id + '" value="No"><span>No</span></label>',
      '  </div>',
      '</div>',

      '<div data-block="aladdin" class="pa-hidden">',
      '  <div class="reg-row">',
      '    <label class="reg-label">Do they plan to audition for <em>Aladdin</em> on Monday, August 31?</label>',
      '    <div class="reg-choices inline">',
      '      <label class="reg-check"><input type="radio" name="ala_' + id + '" value="Yes"><span>Yes</span></label>',
      '      <label class="reg-check"><input type="radio" name="ala_' + id + '" value="No"><span>No</span></label>',
      '      <label class="reg-check"><input type="radio" name="ala_' + id + '" value="Not sure yet"><span>Not sure yet</span></label>',
      '    </div>',
      '  </div>',
      '  <div class="reg-row">',
      '    <label class="reg-label">Which roles interest them most?</label>',
      '    <input class="reg-input" type="text" data-field="roles" placeholder="Aladdin, Jasmine, Genie, ensemble…">',
      '  </div>',
      '</div>',

      '<div class="reg-row">',
      '  <label class="reg-label">Tell us about their experience on stage, or their lack of it.</label>',
      '  <p class="reg-help">Anything you want us to know helps us cast well.</p>',
      '  <textarea class="reg-textarea" data-field="experience" placeholder="Years of piano, a shy first-timer, loves to dance, has never sung in front of anyone…"></textarea>',
      '</div>',

      '<div class="reg-row pa-hidden" data-block="three">',
      '  <label class="reg-label">If they could choose between dance, ukulele and guitar, or piano — which would they choose this quarter?</label>',
      '  <div class="reg-choices">',
      '    <label class="reg-check"><input type="radio" name="three_' + id + '" value="Dance"><span>Dance</span></label>',
      '    <label class="reg-check"><input type="radio" name="three_' + id + '" value="Ukulele and guitar"><span>Ukulele and guitar</span></label>',
      '    <label class="reg-check"><input type="radio" name="three_' + id + '" value="Piano"><span>Piano</span></label>',
      '  </div>',
      '</div>',

      '<div class="reg-row pa-hidden" data-block="two">',
      '  <label class="reg-label">If they could choose between dance and instruments — which would they choose this quarter?</label>',
      '  <div class="reg-choices">',
      '    <label class="reg-check"><input type="radio" name="two_' + id + '" value="Dance"><span>Dance</span></label>',
      '    <label class="reg-check"><input type="radio" name="two_' + id + '" value="Instruments"><span>Instruments</span></label>',
      '  </div>',
      '</div>',

      '<div class="pa-note pa-hidden" data-block="youngest">',
      '  <b>A note for our youngest students.</b>',
      '  Our youngest students get a great deal of the arts. They take part in our big productions, they prepare a show of their own, and they have drill, crafts and fine arts through the week. Separate instrument and dance lessons begin in 5th grade, so that is the one piece their week does not yet include.',
      '</div>',

      '<div class="reg-row">',
      '  <label class="reg-label">Would they like to take Spanish this quarter?<span class="req">*</span></label>',
      '  <p class="reg-help">We encourage as many students as possible to learn Spanish, though it is not required. The alternative is silent reading or study hall.</p>',
      '  <div class="reg-choices inline">',
      '    <label class="reg-check"><input type="radio" name="esp_' + id + '" value="Yes"><span>Yes, Spanish</span></label>',
      '    <label class="reg-check"><input type="radio" name="esp_' + id + '" value="No"><span>No thank you</span></label>',
      '  </div>',
      '</div>'
    ].join("\n");
  }

  function wireCard(card) {
    card.querySelector('[data-action="remove"]').addEventListener("click", function () { removeStudent(card); });
    card.querySelector('[data-field="age"]').addEventListener("change", function () { applyBand(card); });
    card.querySelector('[data-field="name"]').addEventListener("input", renumber);

    card.querySelectorAll("input[type=radio]").forEach(function (r) {
      r.addEventListener("change", function () {
        card.querySelectorAll("input[name='" + r.name + "']").forEach(function (sib) {
          const lbl = sib.closest(".reg-check");
          if (lbl) lbl.classList.toggle("checked", sib.checked);
        });
        if (r.name.indexOf("join_") === 0) {
          block(card, "aladdin").classList.toggle("pa-hidden", !(r.checked && r.value === "Yes"));
        }
      });
    });

    applyBand(card);
  }

  function block(card, name) {
    return card.querySelector('[data-block="' + name + '"]');
  }

  function bandOf(card) {
    const a = parseInt(card.querySelector('[data-field="age"]').value, 10);
    if (isNaN(a)) return "";
    if (a <= 8) return "youngest";
    if (a <= 10) return "two";
    return "three";
  }

  function applyBand(card) {
    const b = bandOf(card);
    block(card, "three").classList.toggle("pa-hidden", b !== "three");
    block(card, "two").classList.toggle("pa-hidden", b !== "two");
    block(card, "youngest").classList.toggle("pa-hidden", b !== "youngest");

    // Clear an answer left behind on a question that is no longer shown.
    [["three", "three_"], ["two", "two_"]].forEach(function (pair) {
      if (!block(card, pair[0]).classList.contains("pa-hidden")) return;
      block(card, pair[0]).querySelectorAll("input[type=radio]").forEach(function (r) {
        r.checked = false;
        const lbl = r.closest(".reg-check");
        if (lbl) lbl.classList.remove("checked");
      });
    });
  }

  function renumber() {
    const cards = document.querySelectorAll(".pa-student");
    cards.forEach(function (card, i) {
      const nameEl = card.querySelector('[data-field="name"]');
      const name = (nameEl.value || "").trim();
      card.querySelector("[data-title]").textContent =
        name ? "Student " + (i + 1) + " — " + name : "Student " + (i + 1);
      card.querySelector('[data-action="remove"]').classList.toggle("pa-hidden", cards.length <= 1);
    });
  }

  // ---- Reading ----------------------------------------------------------
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function cardRadio(card, prefix) {
    const el = card.querySelector("input[name^='" + prefix + "']:checked");
    return el ? el.value : "";
  }

  function cardField(card, name) {
    const el = card.querySelector('[data-field="' + name + '"]');
    return el ? el.value.trim() : "";
  }

  function readCard(card) {
    const b = bandOf(card);
    return {
      name: cardField(card, "name"),
      age: parseInt(cardField(card, "age"), 10) || null,
      join: cardRadio(card, "join_"),
      aladdin: cardRadio(card, "ala_"),
      roles: cardField(card, "roles"),
      experience: cardField(card, "experience"),
      artsChoice: cardRadio(card, "three_") || cardRadio(card, "two_") || "",
      artsQuestion: b === "three" ? "Dance / ukulele and guitar / piano"
                  : (b === "two" ? "Dance / instruments" : "Not asked (age 6-8)"),
      spanish: cardRadio(card, "esp_")
    };
  }

  // ---- Validation -------------------------------------------------------
  function validate() {
    if (!val("parentName")) return "Please enter your name.";
    const email = val("parentEmail");
    if (!email) return "Please enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";

    const cards = Array.prototype.slice.call(document.querySelectorAll(".pa-student"));
    if (cards.length === 0) return "Please add at least one student.";

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const s = readCard(card);
      const who = s.name ? s.name : "Student " + (i + 1);

      if (!s.name) return "Please enter a name for student " + (i + 1) + ".";
      if (!s.age) return "Please choose an age for " + who + ".";
      if (!s.join) return "Please say whether " + who + " will join our performances.";

      const b = bandOf(card);
      if (b === "three" && !s.artsChoice) {
        return "For " + who + ", please choose between dance, ukulele and guitar, or piano.";
      }
      if (b === "two" && !s.artsChoice) {
        return "For " + who + ", please choose between dance and instruments.";
      }
      if (!s.spanish) return "For " + who + ", please answer the Spanish question.";
    }

    // Two cards with the same name is almost always a mis-click on Add.
    const names = cards.map(function (c) { return cardField(c, "name").toLowerCase(); });
    for (let i = 0; i < names.length; i++) {
      if (names.indexOf(names[i]) !== i) {
        return "Two students have the same name. Please correct one, or remove the extra card.";
      }
    }

    return null;
  }

  // ---- Payload ----------------------------------------------------------
  function buildPayload() {
    const cards = Array.prototype.slice.call(document.querySelectorAll(".pa-student"));
    return {
      submittedAt: new Date().toISOString(),
      formType: "performing-arts-choices",
      schoolYear: SCHOOL_YEAR,
      parent: { name: val("parentName"), email: val("parentEmail") },
      children: cards.map(readCard),
      notes: val("notes")
    };
  }

  // ---- Submit -----------------------------------------------------------
  function submitForm(e) {
    e.preventDefault();
    clearMessages();

    const err = validate();
    if (err) { showError(err); return; }

    const submitBtn = document.getElementById("reg-submit");
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    const payload = buildPayload();

    if (!BACKEND_URL || BACKEND_URL === "__BACKEND_URL__") {
      console.log("Performing Arts payload (no backend configured):", payload);
      showError("Almost ready — this form isn't switched on yet. Please try again shortly, or email learn@rivertech.me.");
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      return;
    }

    fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) {
          showError((data && data.error) || "Something went wrong. Please try again or email learn@rivertech.me.");
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          return;
        }
        const rid = data.referenceId ? ("?id=" + encodeURIComponent(data.referenceId)) : "";
        window.location.href = "register-performing-arts-2026-27-success.html" + rid;
      })
      .catch(function (fetchErr) {
        console.error("Submit error:", fetchErr);
        showError("We couldn't reach the server. Please check your connection and try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      });
  }

  // ---- UI messaging -----------------------------------------------------
  function showError(msg) {
    const box = document.getElementById("reg-error");
    box.textContent = msg;
    box.classList.add("show");
    if (typeof box.scrollIntoView === "function") {
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function clearMessages() {
    document.getElementById("reg-error").classList.remove("show");
    document.getElementById("reg-success").classList.remove("show");
  }
})();
