package com.pixel.zadachnik;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The page hands the widget what it needs (counts + the chosen eye skin) as one JSON string; the widgets redraw from it. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String state = call.getString("state");
        if (state == null) { call.reject("no state"); return; }
        getContext().getSharedPreferences(ZWidget.PREFS, 0).edit().putString("state", state).apply();
        ZWidget.updateAll(getContext());
        call.resolve();
    }
}
