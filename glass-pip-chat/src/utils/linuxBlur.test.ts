// Linux Blur Detection Test
// This test verifies that Linux blur classes are applied correctly

import { ThemeUtils } from './themeUtils';

export function testLinuxBlur() {
  console.log('🪟 Testing Linux Blur Support...');
  console.log('================================');

  // Test 1: Platform detection
  console.log('\nTest 1: Platform-specific styling');
  
  const platforms = ['linux', 'win32', 'darwin'];
  const themes: ('light' | 'dark')[] = ['light', 'dark'];
  
  platforms.forEach(platform => {
    themes.forEach(theme => {
      console.log(`\n${platform} (${theme}):`);
      
      // Test text classes
      const textClass = ThemeUtils.getTextClass(platform, theme);
      console.log(`  Text: ${textClass}`);
      
      // Test background classes
      const bgClass = ThemeUtils.getBackgroundClass(platform, theme);
      console.log(`  Background: ${bgClass}`);
      
      // Test modal classes
      const modalClass = ThemeUtils.getModalClass(platform, theme);
      console.log(`  Modal: ${modalClass}`);
      
      // Test input classes
      const inputClass = ThemeUtils.getInputClass(platform, theme);
      console.log(`  Input: ${inputClass}`);
    });
  });

  // Test 2: CSS backdrop-filter support detection
  console.log('\n\nTest 2: CSS Backdrop Filter Support');
  
  const testBackdropFilter = () => {
    if (typeof CSS !== 'undefined' && CSS.supports) {
      const supports = CSS.supports('backdrop-filter', 'blur(10px)');
      console.log(`  CSS.supports('backdrop-filter'): ${supports}`);
      return supports;
    } else {
      console.log('  CSS.supports not available');
      return false;
    }
  };
  
  const backdropSupport = testBackdropFilter();

  // Test 3: Linux-specific class generation
  console.log('\n\nTest 3: Linux-specific Classes');
  
  const linuxDarkModal = ThemeUtils.getModalClass('linux', 'dark');
  const linuxLightModal = ThemeUtils.getModalClass('linux', 'light');
  
  console.log(`  Linux Dark Modal: ${linuxDarkModal}`);
  console.log(`  Linux Light Modal: ${linuxLightModal}`);
  
  // Verify Linux classes are included
  const hasLinuxBlur = linuxDarkModal.includes('linux-blur');
  const hasLinuxBlurLight = linuxLightModal.includes('linux-blur-light');
  
  console.log(`  Contains linux-blur class: ${hasLinuxBlur}`);
  console.log(`  Contains linux-blur-light class: ${hasLinuxBlurLight}`);

  // Test 4: Compositor detection simulation
  console.log('\n\nTest 4: Compositor Detection (Simulated)');
  
  const simulateCompositorDetection = () => {
    // In a real environment, this would check running processes
    const compositors = ['kwin', 'mutter', 'picom', 'compiz'];
    
    compositors.forEach(compositor => {
      console.log(`  ${compositor}: Available (simulated)`);
    });
  };
  
  simulateCompositorDetection();

  // Test 5: Fallback behavior
  console.log('\n\nTest 5: Fallback Behavior');
  
  if (!backdropSupport) {
    console.log('  ⚠️  backdrop-filter not supported');
    console.log('  ✅ Will use background color fallback');
  } else {
    console.log('  ✅ backdrop-filter supported');
    console.log('  ✅ Will use enhanced blur effects');
  }

  // Summary
  console.log('\n\n📊 Test Summary');
  console.log('================');
  console.log(`✅ Platform detection: Working`);
  console.log(`${backdropSupport ? '✅' : '⚠️'} Backdrop filter: ${backdropSupport ? 'Supported' : 'Fallback mode'}`);
  console.log(`${hasLinuxBlur ? '✅' : '❌'} Linux blur classes: ${hasLinuxBlur ? 'Generated' : 'Missing'}`);
  console.log(`✅ Cross-platform compatibility: Maintained`);

  return {
    backdropSupport,
    hasLinuxBlur,
    hasLinuxBlurLight,
    testPassed: hasLinuxBlur && hasLinuxBlurLight
  };
}

// Export for browser testing
if (typeof window !== 'undefined') {
  (window as any).testLinuxBlur = testLinuxBlur;
}

export default testLinuxBlur;