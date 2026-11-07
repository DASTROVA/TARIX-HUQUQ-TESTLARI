
(() => {
  const db = window.supabaseClient;
  const $ = id => document.getElementById(id);

  let articles = [];
  let questions = [];
  let contents = [];

  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));

  function notify(text) {
    $("dashboardMessage").textContent = text;
  }

  function showLogin(text = "") {
    $("loginView").hidden = false;
    $("dashboardView").hidden = true;
    $("loginMessage").textContent = text;
  }

  async function verifyAdmin(user) {
    const { data, error } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  }

  async function enterDashboard(user) {
    const allowed = await verifyAdmin(user);

    if (!allowed) {
      await db.auth.signOut();
      showLogin("Bu hisobga admin ruxsati berilmagan.");
      return;
    }

    $("loginView").hidden = true;
    $("dashboardView").hidden = false;
    $("adminEmail").textContent = user.email || "Administrator";

    await loadAll();
  }

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!db) {
      showLogin("Supabase sozlamalarini tekshiring.");
      return;
    }

    const button = $("loginForm").querySelector("button");
    button.disabled = true;
    button.textContent = "Tekshirilmoqda...";

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: $("email").value.trim(),
        password: $("password").value
      });

      if (error) throw error;
      await enterDashboard(data.user);
    } catch (error) {
      showLogin(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Tizimga kirish →";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await db.auth.signOut();
    showLogin("Tizimdan chiqdingiz.");
  });

  async function loadAll() {
    notify("Ma’lumotlar yuklanmoqda...");

    try {
      const results = await Promise.all([
        db.from("articles").select("*").order("created_at", {ascending:false}),
        db.from("test_questions").select("*").order("id", {ascending:false}),
        db.from("site_content").select("*").order("content_key"),
        db.from("analytics_events").select("*").order("created_at", {ascending:false}).limit(100)
      ]);

      for (const result of results) {
        if (result.error) throw result.error;
      }

      articles = results[0].data || [];
      questions = results[1].data || [];
      contents = results[2].data || [];

      const events = results[3].data || [];
      const today = new Date().toISOString().slice(0,10);

      $("totalArticles").textContent = articles.length;
      $("totalQuestions").textContent = questions.length;
      $("totalViews").textContent = events.length;
      $("todayViews").textContent = events.filter(
        item => item.created_at?.slice(0,10) === today
      ).length;

      renderArticles();
      renderQuestions();
      renderContents();
      renderAnalytics(events);

      notify("Ma’lumotlar yangilandi.");
    } catch (error) {
      notify("Xatolik: " + error.message);
    }
  }

  function navigate(page) {
    document.querySelectorAll(".page").forEach(section => {
      section.classList.toggle("active", section.id === "page-" + page);
    });

    document.querySelectorAll(".nav-btn").forEach(button => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    const titles = {
      dashboard:"Dashboard",
      articles:"Maqolalar",
      questions:"Test savollari",
      content:"Sayt matnlari",
      analytics:"Statistika"
    };

    $("pageTitle").textContent = titles[page] || "Dashboard";
  }

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });

  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.go));
  });

  function renderArticles() {
    $("articlesList").innerHTML = articles.length
      ? articles.map(item => `
        <div class="item">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.category || "Kategoriyasiz")} ·
          ${item.is_published ? "E’lon qilingan" : "Qoralama"}</p>
          <p>${escapeHTML(item.summary || "")}</p>
          <div class="item-actions">
            <button class="secondary" data-edit-article="${item.id}">Tahrirlash</button>
            <button class="delete-btn" data-delete-article="${item.id}">O‘chirish</button>
          </div>
        </div>
      `).join("")
      : '<p class="muted">Hozircha maqolalar mavjud emas.</p>';
  }

  function resetArticleForm() {
    $("articleForm").reset();
    $("articleId").value = "";
    $("articleFormTitle").textContent = "Yangi maqola";
    $("articleForm").hidden = true;
  }

  $("newArticleBtn").addEventListener("click", () => {
    resetArticleForm();
    $("articleForm").hidden = false;
  });

  $("cancelArticle").addEventListener("click", resetArticleForm);

  $("articlesList").addEventListener("click", async event => {
    const editId = event.target.dataset.editArticle;
    const deleteId = event.target.dataset.deleteArticle;

    if (editId) {
      const item = articles.find(x => String(x.id) === editId);
      if (!item) return;

      $("articleId").value = item.id;
      $("articleTitle").value = item.title || "";
      $("articleCategory").value = item.category || "";
      $("articleSummary").value = item.summary || "";
      $("articleBody").value = item.body || "";
      $("articleImage").value = item.image_url || "";
      $("articlePublished").checked = !!item.is_published;
      $("articleFormTitle").textContent = "Maqolani tahrirlash";
      $("articleForm").hidden = false;
      $("articleForm").scrollIntoView({behavior:"smooth"});
    }

    if (deleteId && confirm("Bu maqolani o‘chirmoqchimisiz?")) {
      try {
        const { error } = await db.from("articles").delete().eq("id", deleteId);
        if (error) throw error;
        notify("Maqola o‘chirildi.");
        await loadAll();
      } catch (error) {
        notify("Xatolik: " + error.message);
      }
    }
  });

  $("articleForm").addEventListener("submit", async event => {
    event.preventDefault();

    const id = $("articleId").value;
    const record = {
      title: $("articleTitle").value.trim(),
      category: $("articleCategory").value.trim(),
      summary: $("articleSummary").value.trim(),
      body: $("articleBody").value.trim(),
      image_url: $("articleImage").value.trim() || null,
      is_published: $("articlePublished").checked
    };

    try {
      const query = id
        ? db.from("articles").update(record).eq("id", id)
        : db.from("articles").insert(record);

      const { error } = await query;
      if (error) throw error;

      resetArticleForm();
      notify("Maqola muvaffaqiyatli saqlandi.");
      await loadAll();
    } catch (error) {
      notify("Xatolik: " + error.message);
    }
  });

  function renderQuestions() {
    const filter = $("questionFilter").value;
    const filtered = filter === "all"
      ? questions
      : questions.filter(q => String(q.test_number) === filter);

    $("questionsList").innerHTML = filtered.length
      ? filtered.map(item => `
        <div class="item">
          <h3>${escapeHTML(item.question)}</h3>
          <p>${item.test_number}-test · To‘g‘ri javob:
          ${["A","B","C","D"][item.correct_index] || "?"}</p>
          <div class="item-actions">
            <button class="secondary" data-edit-question="${item.id}">Tahrirlash</button>
            <button class="delete-btn" data-delete-question="${item.id}">O‘chirish</button>
          </div>
        </div>
      `).join("")
      : '<p class="muted">Bu testda savollar yo‘q.</p>';
  }

  $("questionFilter").addEventListener("change", renderQuestions);

  function resetQuestionForm() {
    $("questionForm").reset();
    $("questionId").value = "";
    $("questionFormTitle").textContent = "Yangi savol";
    $("questionForm").hidden = true;
  }

  $("newQuestionBtn").addEventListener("click", () => {
    resetQuestionForm();
    $("questionForm").hidden = false;
  });

  $("cancelQuestion").addEventListener("click", resetQuestionForm);

  $("questionsList").addEventListener("click", async event => {
    const editId = event.target.dataset.editQuestion;
    const deleteId = event.target.dataset.deleteQuestion;

    if (editId) {
      const item = questions.find(x => String(x.id) === editId);
      if (!item) return;

      $("questionId").value = item.id;
      $("testNumber").value = item.test_number;
      $("questionText").value = item.question || "";

      (item.options || []).forEach((option, i) => {
        $("option" + i).value = option;
      });

      $("correctIndex").value = item.correct_index;
      $("explanation").value = item.explanation || "";
      $("questionFormTitle").textContent = "Savolni tahrirlash";
      $("questionForm").hidden = false;
      $("questionForm").scrollIntoView({behavior:"smooth"});
    }

    if (deleteId && confirm("Bu savolni o‘chirmoqchimisiz?")) {
      try {
        const { error } = await db.from("test_questions").delete().eq("id", deleteId);
        if (error) throw error;
        notify("Savol o‘chirildi.");
        await loadAll();
      } catch (error) {
        notify("Xatolik: " + error.message);
      }
    }
  });

  $("questionForm").addEventListener("submit", async event => {
    event.preventDefault();

    const id = $("questionId").value;
    const record = {
      test_number: Number($("testNumber").value),
      question: $("questionText").value.trim(),
      options: [0,1,2,3].map(i => $("option" + i).value.trim()),
      correct_index: Number($("correctIndex").value),
      explanation: $("explanation").value.trim()
    };

    try {
      const query = id
        ? db.from("test_questions").update(record).eq("id", id)
        : db.from("test_questions").insert(record);

      const { error } = await query;
      if (error) throw error;

      resetQuestionForm();
      notify("Test savoli saqlandi.");
      await loadAll();
    } catch (error) {
      notify("Xatolik: " + error.message);
    }
  });

  function renderContents() {
    $("contentList").innerHTML = contents.length
      ? contents.map(item => `
        <div class="item">
          <h3>${escapeHTML(item.content_key)}</h3>
          <p>${escapeHTML(item.content_value)}</p>
          <div class="item-actions">
            <button class="secondary" data-edit-content="${escapeHTML(item.content_key)}">Tahrirlash</button>
          </div>
        </div>
      `).join("")
      : '<p class="muted">Sayt matnlari hali kiritilmagan.</p>';
  }

  $("contentList").addEventListener("click", event => {
    const key = event.target.dataset.editContent;
    if (!key) return;

    const item = contents.find(x => x.content_key === key);
    if (!item) return;

    $("contentKey").value = item.content_key;
    $("contentValue").value = item.content_value;
    $("contentForm").scrollIntoView({behavior:"smooth"});
  });

  $("contentForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const { error } = await db.from("site_content").upsert({
        content_key: $("contentKey").value.trim(),
        content_value: $("contentValue").value.trim(),
        updated_at: new Date().toISOString()
      }, {onConflict:"content_key"});

      if (error) throw error;

      $("contentForm").reset();
      notify("Sayt matni saqlandi.");
      await loadAll();
    } catch (error) {
      notify("Xatolik: " + error.message);
    }
  });

  function renderAnalytics(events) {
    const rows = events.map(item => `
      <tr>
        <td>${escapeHTML(item.page_path || "—")}</td>
        <td>${escapeHTML(item.ref_source || "To‘g‘ridan-to‘g‘ri")}</td>
        <td>${escapeHTML(item.ref_code || "—")}</td>
        <td>${item.created_at ? new Date(item.created_at).toLocaleString("uz-UZ") : "—"}</td>
      </tr>
    `).join("");

    $("analyticsList").innerHTML = rows ||
      '<tr><td colspan="4">Hozircha tashriflar mavjud emas.</td></tr>';

    $("recentVisits").innerHTML = events.slice(0,5).map(item => `
      <tr>
        <td>${escapeHTML(item.page_path || "—")}</td>
        <td>${escapeHTML(item.ref_source || "To‘g‘ridan-to‘g‘ri")}</td>
        <td>${item.created_at ? new Date(item.created_at).toLocaleString("uz-UZ") : "—"}</td>
      </tr>
    `).join("") || '<tr><td colspan="3">Tashriflar yo‘q.</td></tr>';
  }

  $("refreshAnalytics").addEventListener("click", loadAll);

  if (!db) {
    showLogin("Supabase URL va anon key kiritilmagan.");
    return;
  }

  db.auth.getSession().then(async ({data, error}) => {
    if (error) {
      showLogin(error.message);
      return;
    }

    if (data.session) {
      try {
        await enterDashboard(data.session.user);
      } catch (error) {
        showLogin(error.message);
      }
    }
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") showLogin();
  });
})();
  
