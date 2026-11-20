package com.pixel.zadachnik;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Home-screen widgets. Each one is drawn as a single bitmap in the app's pixel style (gold notched frame, the chosen eye skin,
 * the bundled Pixelify font), from the state the page stores through WidgetPlugin:
 * {open, done:[timestamps], grid:[11 strings of 9 rows], pal:{char:"#rrggbb"}, pupil, eyes:[[x,y]], pw, ph, body, acc}.
 * "Done" counts what was ticked today (so it starts from zero every morning, even if the app was not opened); total = done + open.
 * Every frame takes the skin's main colour.
 * Kinds: 0 = A 2×1 eye + count, 1 = A2 2×1 skin-coloured frame, 2 = B 2×2 big eye + beads, 3 = C 4×1 progress bar, 4 = D 1×1 eye + badge.
 */
public abstract class ZWidget extends AppWidgetProvider {
    static final String PREFS = "zadachnik_widget";
    // design canvas per kind, in dp-like units (the same sizes as the mockup); the drawing is scaled to the real widget size
    static final float[] DW = {170, 170, 170, 350, 80};
    static final float[] DH = {80, 80, 170, 80, 80};
    static final Class<?>[] ALL = {WidgetA.class, WidgetA2.class, WidgetB.class, WidgetC.class, WidgetD.class};

    abstract int kind();

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) draw(c, m, id, kind());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        draw(c, m, id, kind());
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int k = 0; k < ALL.length; k++)
            for (int id : m.getAppWidgetIds(new ComponentName(c, ALL[k]))) draw(c, m, id, k);
    }

    // ---------- state ----------
    static final class State {
        int open, done;
        String[] grid = {"...........", "...........", ".XXX...XXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..XXXXXXX..", "..........."};
        Map<Character, Integer> pal = new HashMap<>();
        int pupil = Color.parseColor("#05070b"), body = Color.parseColor("#7f9d48"), acc = Color.parseColor("#5d7a2f");
        int[][] eyes = {{5, 4}};
        float pw = 1, ph = 1;
        boolean empty = true;
    }

    static State load(Context c) {
        State s = new State();
        s.pal.put('X', s.body);
        String j = c.getSharedPreferences(PREFS, 0).getString("state", null);
        if (j == null) return s;
        try {
            JSONObject o = new JSONObject(j);
            s.open = o.optInt("open");
            JSONArray d = o.optJSONArray("done");
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
            long today = cal.getTimeInMillis();
            if (d != null) for (int i = 0; i < d.length(); i++) if (d.optLong(i) >= today) s.done++;
            JSONArray g = o.optJSONArray("grid");
            if (g != null && g.length() > 0) { s.grid = new String[g.length()]; for (int i = 0; i < g.length(); i++) s.grid[i] = g.optString(i); }
            s.pal.clear();
            JSONObject p = o.optJSONObject("pal");
            if (p != null) for (Iterator<String> it = p.keys(); it.hasNext(); ) {
                String k = it.next();
                if (k.length() == 1) s.pal.put(k.charAt(0), col(p.optString(k), Color.WHITE));
            }
            s.pupil = col(o.optString("pupil"), s.pupil);
            s.body = col(o.optString("body"), s.pal.containsKey('X') ? s.pal.get('X') : s.body);
            s.acc = col(o.optString("acc"), s.pupil);
            JSONArray e = o.optJSONArray("eyes");
            if (e != null && e.length() > 0) {
                s.eyes = new int[e.length()][2];
                for (int i = 0; i < e.length(); i++) { JSONArray xy = e.optJSONArray(i); s.eyes[i][0] = xy.optInt(0); s.eyes[i][1] = xy.optInt(1); }
            }
            s.pw = (float) o.optDouble("pw", 1); s.ph = (float) o.optDouble("ph", 1);
            s.empty = false;
        } catch (Exception ignored) { }
        return s;
    }

    static int col(String hex, int fallback) {
        try { return hex == null || hex.isEmpty() ? fallback : Color.parseColor(hex); } catch (Exception e) { return fallback; }
    }

    // ---------- drawing ----------
    static Typeface reg, bold;

    static void fonts(Context c) {
        if (bold != null) return;
        try {
            reg = Typeface.createFromAsset(c.getAssets(), "fonts/PixelifyZadachnik-Regular.ttf");
            bold = Typeface.createFromAsset(c.getAssets(), "fonts/PixelifyZadachnik-Bold.ttf");
        } catch (Exception e) { reg = Typeface.MONOSPACE; bold = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); }
    }

    static final int GOLD = Color.parseColor("#7a5a22"), BG = Color.parseColor("#0b0f18"), NUM = Color.parseColor("#f3d48a"),
            DIM = Color.parseColor("#a9b3c7"), INK = Color.parseColor("#efe3c2"), BEAD = Color.parseColor("#1d2636"),
            BEAD_LINE = Color.parseColor("#2c3a52"), FILL = Color.parseColor("#e0b13e"), RED = Color.parseColor("#c4566a"), GREEN = Color.parseColor("#49b65a");

    static void draw(Context c, AppWidgetManager m, int id, int kind) {
        fonts(c);
        Bundle o = m.getAppWidgetOptions(id);
        float d = c.getResources().getDisplayMetrics().density;
        int wdp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0), hdp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (wdp <= 0) wdp = (int) DW[kind];
        if (hdp <= 0) hdp = (int) DH[kind];
        int W = Math.max(8, Math.round(wdp * d)), H = Math.max(8, Math.round(hdp * d));
        Bitmap b = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        float s = Math.min(W / DW[kind], H / DH[kind]);
        cv.translate((W - DW[kind] * s) / 2f, (H - DH[kind] * s) / 2f);
        cv.scale(s, s);
        paint(cv, kind, load(c));

        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.zwidget);
        rv.setImageViewBitmap(R.id.zw_img, b);
        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch != null) {
            PendingIntent pi = PendingIntent.getActivity(c, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            rv.setOnClickPendingIntent(R.id.zw_img, pi);
        }
        m.updateAppWidget(id, rv);
    }

    static Paint fill(int color) { Paint p = new Paint(); p.setColor(color); p.setAntiAlias(false); return p; }

    static void rect(Canvas cv, float l, float t, float r, float b, int color) { cv.drawRect(l, t, r, b, fill(color)); }

    /** Notched pixel frame like .px in the app: bars outside the box, corners left out, a light line on top and a shade at the bottom. */
    static void frame(Canvas cv, float w, float h, int color) {
        float u = 4;
        rect(cv, u, 0, w - u, u, color); rect(cv, u, h - u, w - u, h, color);
        rect(cv, 0, u, u, h - u, color); rect(cv, w - u, u, w, h - u, color);
        rect(cv, u, u, w - u, h - u, BG);
        rect(cv, u, u, w - u, 2 * u, Color.argb(15, 255, 255, 255));
        rect(cv, u, h - 2 * u, w - u, h - u, Color.argb(89, 0, 0, 0));
    }

    /** The eye, 11×9 cells. In the widget the pupil sits a pixel lower and widens as the day gets done: nothing done = the skin's own size,
     *  half done = a step bigger, all done = one cell bigger. While something is left it looks down at the tasks;
     *  when everything is done it looks back up, straight at you. */
    static void eye(Canvas cv, float x, float y, float w, State s) {
        float cell = w / 11f;
        for (int r = 0; r < s.grid.length; r++)
            for (int k = 0; k < s.grid[r].length(); k++) {
                char ch = s.grid[r].charAt(k);
                Integer colr = s.pal.get(ch);
                if (colr == null) continue;
                rect(cv, x + k * cell, y + r * cell, x + (k + 1) * cell, y + (r + 1) * cell, colr);
            }
        int total = s.open + s.done;
        float g = total == 0 ? 0 : Math.round(s.done * 2f / total) / 2f;
        for (int[] e : s.eyes) {
            boolean allDone = total > 0 && s.open == 0;
            float ph = s.ph + g, pw = s.pw + g, yy = allDone ? e[1] : Math.min(e[1] + 1, 9 - ph);
            rect(cv, x + (e[0] - g / 2) * cell, y + (yy - g / 2) * cell, x + (e[0] - g / 2 + pw) * cell, y + (yy - g / 2 + ph) * cell, s.pupil);
        }
    }

    static Paint text(float size, int color, boolean isBold, Paint.Align align) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setTypeface(isBold ? bold : reg); p.setTextSize(size); p.setColor(color); p.setTextAlign(align);
        return p;
    }

    static void paint(Canvas cv, int kind, State s) {
        int total = s.open + s.done;
        boolean all = total > 0 && s.open == 0;
        String big = s.empty ? "—" : s.done + "/" + total;
        int L = big.length();
        float w = DW[kind], h = DH[kind];
        switch (kind) {
            case 0: { // A · 2×1: eye + count, the count centred on the height; two-digit counts get a size smaller
                frame(cv, w, h, s.body);
                eye(cv, 18, (h - 45) / 2f, 55, s);
                float n = L <= 3 ? 30 : L == 4 ? 24 : 20, l = L <= 3 ? 13 : L == 4 ? 12 : 11, block = n * .8f + 6 + l * .8f, top = (h - block) / 2f;
                cv.drawText(big, 87, top + n * .8f, text(n, NUM, true, Paint.Align.LEFT));
                cv.drawText(s.empty ? "открой задачник" : all ? "всё сделано" : "сделано", 87, top + block, text(l, DIM, false, Paint.Align.LEFT));
                break;
            }
            case 1: { // A2 · 2×1: frame in the skin's colours, no eye
                float u = 4;
                rect(cv, u, 0, w - u, u, s.body); rect(cv, u, h - u, w - u, h, s.body);
                rect(cv, 0, u, u, h - u, s.body); rect(cv, w - u, u, w, h - u, s.body);
                rect(cv, u, u, w - u, h - u, s.acc);
                rect(cv, u + 3, u + 3, w - u - 3, h - u - 3, BG);
                rect(cv, 0, 0, u, u, s.pupil); rect(cv, w - u, 0, w, u, s.pupil); rect(cv, 0, h - u, u, h, s.pupil); rect(cv, w - u, h - u, w, h, s.pupil);
                float n = L <= 3 ? 32 : L == 4 ? 28 : 24, l = L <= 3 ? 13 : L == 4 ? 12 : 11, block = n * .8f + 7 + l * .8f, top = (h - block) / 2f;
                cv.drawText(big, w / 2f, top + n * .8f, text(n, s.body, true, Paint.Align.CENTER));
                cv.drawText(s.empty ? "открой задачник" : all ? "всё сделано" : "задачи", w / 2f, top + block, text(l, DIM, false, Paint.Align.CENTER));
                break;
            }
            case 2: { // B · 2×2: big eye, count, beads
                frame(cv, w, h, s.body);
                eye(cv, (w - 88) / 2f, 22, 88, s);
                Paint pn = text(24, NUM, true, Paint.Align.LEFT), pl = text(13, DIM, false, Paint.Align.LEFT);
                String lab = all ? "всё" : "сделано";
                float gap = 6, tw = pn.measureText(big) + gap + pl.measureText(lab), x = (w - tw) / 2f, base = 22 + 72 + 6 + 20;
                cv.drawText(big, x, base, pn);
                cv.drawText(lab, x + pn.measureText(big) + gap, base, pl);
                int nb = Math.min(total, 10), f = total == 0 ? 0 : Math.round(s.done / (float) total * nb);
                float bw = 8, bg = 3, bx = (w - (nb * bw + Math.max(0, nb - 1) * bg)) / 2f, by = base + 8;
                for (int i = 0; i < nb; i++) {
                    float l = bx + i * (bw + bg);
                    if (i < f) rect(cv, l, by, l + bw, by + bw, FILL);
                    else { rect(cv, l, by, l + bw, by + bw, BEAD_LINE); rect(cv, l + 1, by + 1, l + bw - 1, by + bw - 1, BEAD); }
                }
                break;
            }
            case 3: { // C · 4×1: eye, caption + count, progress bar
                frame(cv, w, h, s.body);
                eye(cv, 18, (h - 45) / 2f, 55, s);
                float x0 = 87, x1 = w - 18;
                cv.drawText(s.empty ? "открой задачник" : all ? "всё сделано" : "сделано за день", x0, 36, text(15, INK, false, Paint.Align.LEFT));
                cv.drawText(big, x1, 38, text(22, NUM, true, Paint.Align.RIGHT));
                float by = 47;
                rect(cv, x0, by, x1, by + 8, BEAD_LINE); rect(cv, x0 + 1, by + 1, x1 - 1, by + 7, BEAD);
                if (total > 0) rect(cv, x0, by, x0 + (x1 - x0) * s.done / (float) total, by + 8, FILL);
                break;
            }
            default: { // D · 1×1: eye + badge
                frame(cv, w, h, s.body);
                eye(cv, (w - 46) / 2f, (h - 38) / 2f + 2, 46, s);
                String t = s.empty ? "?" : all ? "✓" : big;
                Paint pt = text(12, Color.WHITE, true, Paint.Align.CENTER);
                float tw = pt.measureText(t) + 8, r = w - 2, l = r - tw;
                rect(cv, l, 2, r, 18, s.open > 0 || s.empty ? RED : GREEN);
                cv.drawText(t, (l + r) / 2f, 14, pt);
            }
        }
    }
}
