/* River Tech — Performing Arts 2026-27 choices — form logic
   One submission per full-time student. No payment.

   Age bands (set by Dan 2026-08-16):
     6-8   → no arts choice question; show the youngest-students note
     9-10  → dance or instruments
     11+   → dance, ukulele and guitar, or piano

   Question numbers renumber themselves so the page always reads 1..n
   with no gaps, whichever branch is showing. */
(function () {
  "use strict";

  // ---- Configuration ----------------------------------------------------
  const BACKEND_URL = "https://script.google.com/macros/s/AKfycbxygFbe4_QSx9-Y4qHzRlILGxpaEaWXmKG2oykF-x5iZ3sAt_8n3FYM-xbiILfvRz6FCg/exec";
  const SCHOOL_YEAR = "2026-27";

  // ---- Boot -------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    wireEvents();
    applyAgeBand();
  });

  // ---- Age branching ----------------------------------------------------
  function ageBand() {
    const el = document.getElementById("studentAge");
    const a = parseInt(el && el.value, 10);
    if (isNaN(a)) return "";
    if (a <= 8) return "youngest";
    if (a <= 10) return "two";
    return "three";
  }

  function applyAgeBand() {
    const band = ageBand();
    show(document.getElementById("q-three"), band === "three");
    show(document.getElementById("q-two"), band === "two");
    show(document.getElementById("q-youngest"), band === "youngest");
    clearHiddenChoices();
    renumber();
  }

  function show(el, visible) {
    if (el) el.classList.toggle("pa-hidden", !visible);
  }

  function isVisible(el) {
    return !!el && !el.classList.contains("pa-hidden");
  }

  // A parent who changes the age must not leave an answer behind on a
  // question that is no longer on screen.
  function clearHiddenChoices() {
    [["q-three", "artsThreeWay"], ["q-two", "artsTwoWay"]].forEach(function (pair) {
      if (isVisible(document.getElementById(pair[0]))) return;
      document.querySelectorAll("input[name='" + pair[1] + "']").forEach(function (r) {
        r.checked = false;
        const lbl = r.closest(".reg-check");
        if (lbl) lbl.classList.remove("checked");
      });
    });
  }

  // Questions 1-3 are fixed; everything after renumbers around the branch.
  function renumber() {
    let n = 4;
    const groups = [
      document.getElementById("q-three"),
      document.getElementById("q-two")
    ];
    groups.forEach(function (g) {
      if (!isVisible(g)) return;
      const num = g.querySelector("[data-num]");
      if (num) num.textContent = n + ".";
      n += 1;
    });
    const spanishRow = document.querySelector("input[name='spanish']");
    const spanishNum = spanishRow && spanishRow.closest(".reg-row").querySelector("[data-num]");
    if (spanishNum) spanishNum.textContent = n + ".";
  }

  // ---- Validation -------------------------------------------------------
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function radio(name) {
    const el = document.querySelector("input[name='" + name + "']:checked");
    return el ? el.value : "";
  }

  function validate() {
    if (!val("studentName")) return "Please enter your student's name.";
    if (!val("parentName")) return "Please enter your name.";
    if (!val("studentAge")) return "Please choose your student's age.";

    const email = val("parentEmail");
    if (!email) return "Please enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Please enter a valid email address.";
    }

    if (!radio("join")) return "Please tell us whether your student will join our performances.";

    if (isVisible(document.getElementById("q-three")) && !radio("artsThreeWay")) {
      return "Please choose between dance, ukulele and guitar, or piano.";
    }
    if (isVisible(document.getElementById("q-two")) && !radio("artsTwoWay")) {
      return "Please choose between dance and instruments.";
    }
    if (!radio("spanish")) return "Please tell us whether your student would like Spanish.";

    return null;
  }

  // ---- Payload ----------------------------------------------------------
  function buildPayload() {
    return {
      submittedAt: new Date().toISOString(),
      formType: "performing-arts-choices",
      schoolYear: SCHOOL_YEAR,
      student: {
        name: val("studentName"),
        age: parseInt(val("studentAge"), 10) || null
      },
      parent: {
        name: val("parentName"),
        email: val("parentEmail")
      },
      join: radio("join"),
      aladdin: radio("aladdin"),
      roles: val("roles"),
      experience: val("experience"),
      artsChoice: radio("artsThreeWay") || radio("artsTwoWay") || "",
      artsQuestion: isVisible(document.getElementById("q-three"))
        ? "Dance / ukulele and guitar / piano"
        : (isVisible(document.getElementById("q-two")) ? "Dance / instruments" : "Not asked (age 6-8)"),
      spanish: radio("spanish"),
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

  // ---- Event wiring -----------------------------------------------------
  function wireEvents() {
    const age = document.getElementById("studentAge");
    if (age) age.addEventListener("change", applyAgeBand);

    // The Aladdin question only matters to families who are joining.
    document.querySelectorAll("input[name='join']").forEach(function (r) {
      r.addEventListener("change", function () {
        show(document.getElementById("aladdin-block"), r.value === "Yes" && r.checked);
      });
    });

    // Highlight the selected choice card.
    document.addEventListener("change", function (e) {
      const t = e.target;
      if (!t || t.type !== "radio") return;
      document.querySelectorAll("input[name='" + t.name + "']").forEach(function (sib) {
        const lbl = sib.closest(".reg-check");
        if (lbl) lbl.classList.toggle("checked", sib.checked);
      });
    });

    document.getElementById("pa-form").addEventListener("submit", submitForm);
  }
})();
