import express from "express";
import axios   from "axios";
import path    from "path";
import { fileURLToPath } from "url";

// __dirname doesn't exist in ES Modules — this recreates it
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// ⚠️ Not hardcoded anymore — set API_URL in your Vercel env vars
// Local:      API_URL=http://localhost:5422
// Production: API_URL=https://your-vercel-app.vercel.app
const API_URL = process.env.API_URL;

function getApiBaseUrl(requ) {
    if (API_URL && API_URL.trim()) {
        return API_URL.replace(/\/+$/, "");
    }
    const host = requ.headers["x-forwarded-host"] || requ.headers.host;
    const proto = requ.headers["x-forwarded-proto"] || "https";
    return `${proto}://${host}`;
}

axios.defaults.withCredentials = true;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Explicit views path — required for serverless environments
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Pages ──────────────────────────────────────────────────────

app.get("/", (requ, resp) => {
    resp.render("landing.ejs");
});

app.get("/regis", (requ, resp) => {
    resp.render("register.ejs");
});

app.get("/login", (requ, resp) => {
    resp.render("log_in.ejs");
});

// ── Register ───────────────────────────────────────────────────

app.post("/regCredentials", async (requ, resp) => {
    try {
        const apiBaseUrl = getApiBaseUrl(requ);
        const response_register = await axios.post(apiBaseUrl + "/api/regis", requ.body);
        const resp_data = response_register.data;

        if (resp_data.user_e_mail) {
            return resp.render("log_in.ejs", { usermail: resp_data.user_e_mail });
        }
    } catch (err) {
        const err_data = err.response?.data;
        if (err_data?.exist_er) {
            return resp.render("register.ejs", { existing_error: err_data.exist_er });
        } else if (err_data?.empty_columns_err) {
            return resp.render("register.ejs", { error_empty_columns: err_data.empty_columns_err });
        } else {
            return resp.render("register.ejs", { bad_gateway: err_data?.bad_gateway_err });
        }
    }
});

// ── Login ──────────────────────────────────────────────────────

app.post("/userLogin", async (requ, resp) => {
    try {
        const apiBaseUrl = getApiBaseUrl(requ);
        const response_login = await axios.post(apiBaseUrl + "/api/login", requ.body, {
            withCredentials: true,
        });

        // Forward the session cookie from the API server to the browser
        // "Cookie" here is the HTTP header name — it's a standard HTTP header key, not JSON
        const cook_cookie = response_login.headers["set-cookie"];
        if (cook_cookie) {
            resp.setHeader("Set-Cookie", cook_cookie);
        }

        const post_API_response = await axios.get(apiBaseUrl + "/api/public_posts", {
            headers: { Cookie: cook_cookie }, // pass the cookie to authenticate the next request
            withCredentials: true,
        });

        const post_API_response_Data = post_API_response.data;

        if (post_API_response_Data.Login_again) {
            return resp.render("log_in.ejs", {
                login_again_error: post_API_response_Data.Login_again,
            });
        }

        return resp.redirect("/page_feed");

    } catch (err) {
        const err_data = err.response?.data;
        if (err_data?.not_exist_err) {
            return resp.render("log_in.ejs", { not_exist_error: err_data.not_exist_err });
        } else if (err_data?.pass_err) {
            return resp.render("log_in.ejs", { pass_error: err_data.pass_err });
        } else {
            return resp.render("log_in.ejs", { bad_gateway: "Something went wrong. Try again." });
        }
    }
});

// ── Feed Page ──────────────────────────────────────────────────

app.get("/page_feed", async (requ, resp) => {
    const cook_cookie_received = requ.headers.cookie;

    if (!cook_cookie_received) {
        return resp.redirect("/login");
    }

    try {
        const apiBaseUrl = getApiBaseUrl(requ);
        const posts_APIresp = await axios.get(apiBaseUrl + "/api/public_posts", {
            headers:         { Cookie: cook_cookie_received },
            withCredentials: true,
        });

        const posts_API_data = posts_APIresp.data;

        if (posts_API_data.Login_again) {
            return resp.render("log_in.ejs", { login_again_error: posts_API_data.Login_again });
        }

        return resp.render("public_page.ejs", {
            user_posts:  posts_API_data.retrieved_posts,
            user_points: posts_API_data.user_points_raw,
            uuser_name:  posts_API_data.uusername_raw,
        });

    } catch (e) {
        return resp.redirect("/login");
    }
});

// ── Post Creation ──────────────────────────────────────────────

app.post("/creation", async (requ, resp) => {
    try {
        const incoming_cookie = requ.headers.cookie;
        const apiBaseUrl = getApiBaseUrl(requ);

        const post_api_resp = await axios.post(apiBaseUrl + "/api/post_creation", requ.body, {
            withCredentials: true,
            headers:         { Cookie: incoming_cookie },
        });

        const post_api_data = post_api_resp.data;

        if (post_api_data.success_mess || post_api_data.redirection_mess) {
            return resp.redirect("/page_feed");
        }

    } catch (e) {
        console.log(e.response?.data, "<<-- Post Creation Error");
        return resp.redirect("/page_feed");
    }
});

// ── Logout ─────────────────────────────────────────────────────

app.get("/logout", async (requ, resp) => {
    try {
        const incoming_cookie = requ.headers.cookie;
        const apiBaseUrl = getApiBaseUrl(requ);

        await axios.get(apiBaseUrl + "/api/logout", {
            withCredentials: true,
            headers:         { Cookie: incoming_cookie }, // was missing — logout was failing silently
        });

        resp.clearCookie("connect.sid");
        return resp.redirect("/");

    } catch (err) {
        console.log(err.response?.data, "<- Logout Error");
        return resp.redirect("/");
    }
});

// ── Export for Vercel ──────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || 5433;
    app.listen(port, () => console.log("Frontend running → http://localhost:" + port));
}

export default app;
