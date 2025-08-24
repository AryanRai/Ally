#!/bin/bash

# Glass PiP Chat - Linux Blur Setup Helper
# This script helps detect and configure blur effects for various Linux compositors

echo "🪟 Glass PiP Chat - Linux Blur Setup"
echo "===================================="
echo

# Detect desktop environment
detect_de() {
    if [ "$XDG_CURRENT_DESKTOP" ]; then
        echo "Desktop Environment: $XDG_CURRENT_DESKTOP"
    elif [ "$DESKTOP_SESSION" ]; then
        echo "Desktop Session: $DESKTOP_SESSION"
    else
        echo "Desktop Environment: Unknown"
    fi
}

# Detect compositor
detect_compositor() {
    echo "Detecting compositor..."
    
    if pgrep -x "kwin_x11" > /dev/null || pgrep -x "kwin_wayland" > /dev/null; then
        echo "✅ KWin (KDE) detected"
        echo "   Blur effects should work automatically"
        echo "   You can enable/configure blur in System Settings > Desktop Effects"
        return 0
    fi
    
    if pgrep -x "mutter" > /dev/null; then
        echo "✅ Mutter (GNOME) detected"
        echo "   Consider installing blur extensions like 'Blur my Shell'"
        echo "   Extension URL: https://extensions.gnome.org/extension/3193/blur-my-shell/"
        return 0
    fi
    
    if pgrep -x "picom" > /dev/null; then
        echo "✅ Picom detected"
        check_picom_config
        return 0
    fi
    
    if pgrep -x "compiz" > /dev/null; then
        echo "✅ Compiz detected"
        echo "   Enable the 'Blur' plugin in CompizConfig Settings Manager (ccsm)"
        return 0
    fi
    
    if pgrep -x "compton" > /dev/null; then
        echo "⚠️  Compton detected (legacy)"
        echo "   Consider upgrading to Picom for better blur support"
        return 1
    fi
    
    echo "❌ No supported compositor detected"
    echo "   Glass PiP Chat will use CSS backdrop-filter as fallback"
    echo "   For better performance, consider installing:"
    echo "   - Picom (for i3, bspwm, etc.)"
    echo "   - KWin (KDE)"
    echo "   - Mutter with blur extensions (GNOME)"
    return 1
}

# Check Picom configuration
check_picom_config() {
    local config_file=""
    
    # Check common config locations
    if [ -f "$HOME/.config/picom/picom.conf" ]; then
        config_file="$HOME/.config/picom/picom.conf"
    elif [ -f "$HOME/.config/picom.conf" ]; then
        config_file="$HOME/.config/picom.conf"
    elif [ -f "$HOME/.picom.conf" ]; then
        config_file="$HOME/.picom.conf"
    fi
    
    if [ -n "$config_file" ]; then
        echo "   Config file: $config_file"
        
        if grep -q "blur" "$config_file"; then
            echo "   ✅ Blur configuration found"
        else
            echo "   ⚠️  No blur configuration found"
            offer_picom_config "$config_file"
        fi
    else
        echo "   ⚠️  No Picom config file found"
        offer_picom_config "$HOME/.config/picom/picom.conf"
    fi
}

# Offer to create Picom config
offer_picom_config() {
    local config_file="$1"
    
    echo
    read -p "Would you like to create a basic Picom blur configuration? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mkdir -p "$(dirname "$config_file")"
        
        cat > "$config_file" << 'EOF'
# Picom configuration for Glass PiP Chat
# Basic blur configuration

# Blur settings
blur: {
  method = "dual_kawase";
  strength = 8;
  background = false;
  background-frame = false;
  background-fixed = false;
}

# Exclude certain windows from blur
blur-background-exclude = [
  "window_type = 'dock'",
  "window_type = 'desktop'",
  "_GTK_FRAME_EXTENTS@:c",
  "class_g = 'slop'",
  "class_g = 'Firefox' && argb"
];

# Opacity settings
opacity-rule = [
  "95:class_g = 'Glass PiP Chat'"
];

# Fading
fading = true;
fade-in-step = 0.03;
fade-out-step = 0.03;
fade-delta = 5;

# Shadows
shadow = true;
shadow-radius = 12;
shadow-offset-x = -5;
shadow-offset-y = -5;
shadow-opacity = 0.5;

# Backend
backend = "glx";
vsync = true;
EOF
        
        echo "✅ Picom configuration created at: $config_file"
        echo "   Restart Picom to apply changes: killall picom && picom -b"
    fi
}

# Test blur support
test_blur_support() {
    echo
    echo "Testing CSS backdrop-filter support..."
    
    # This is a basic check - in reality, we'd need to test in the browser
    if command -v google-chrome > /dev/null || command -v chromium > /dev/null || command -v firefox > /dev/null; then
        echo "✅ Modern browser detected - CSS backdrop-filter should be supported"
    else
        echo "⚠️  No modern browser detected - blur effects may not work"
    fi
}

# Main execution
main() {
    detect_de
    echo
    detect_compositor
    test_blur_support
    
    echo
    echo "🎨 Glass PiP Chat Blur Support Summary:"
    echo "======================================"
    echo "• Native compositor blur: Automatic detection and setup"
    echo "• CSS backdrop-filter: Fallback for all systems"
    echo "• Window transparency: Always enabled"
    echo
    echo "For the best experience, ensure your compositor supports blur effects."
    echo "The app will automatically detect your system and apply appropriate styling."
}

# Run the script
main "$@"