package dev.ally.watch

import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.ScrollableState
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.requestFocusOnHierarchyActive
import androidx.wear.compose.foundation.rotary.RotaryScrollableDefaults
import androidx.wear.compose.foundation.rotary.rotaryScrollable
import kotlin.math.abs

internal val LocalBezelHaptics = compositionLocalOf { true }

/** Native rotary input covers the Watch5's touch bezel as well as physical bezels.
 * Keep touch scrolling intact and let the active screen/page own rotary focus. */
@Composable
internal fun Modifier.bezelScroll(state: ScrollableState): Modifier {
    val focus = remember { FocusRequester() }
    return requestFocusOnHierarchyActive().rotaryScrollable(
        behavior = RotaryScrollableDefaults.behavior(state, flingBehavior = null,
            hapticFeedbackEnabled = LocalBezelHaptics.current),
        focusRequester = focus,
    )
}

/** Navigation only: rotating the bezel must never start or finish a recording. */
@Composable
internal fun Modifier.bezelReplies(enabled: Boolean, open: () -> Unit): Modifier {
    val currentOpen by rememberUpdatedState(open)
    val threshold = with(LocalDensity.current) { 12.dp.toPx() }
    var accumulated by remember { mutableFloatStateOf(0f) }
    var previousTime by remember { mutableLongStateOf(0L) }
    var navigated by remember { mutableStateOf(false) }
    LaunchedEffect(enabled) { accumulated = 0f; navigated = false }
    return requestFocusOnHierarchyActive().onRotaryScrollEvent { event ->
        if (enabled && !navigated) {
            if (event.uptimeMillis - previousTime > 400) accumulated = 0f
            previousTime = event.uptimeMillis
            accumulated += event.verticalScrollPixels
            if (abs(accumulated) >= threshold) { navigated = true; currentOpen() }
        }
        true
    }.focusable()
}
