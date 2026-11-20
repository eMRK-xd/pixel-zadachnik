package com.pixel.zadachnik;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** Replaces the generated MainActivity (see .github/workflows/android.yml) to register the app's own widget plugin. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
