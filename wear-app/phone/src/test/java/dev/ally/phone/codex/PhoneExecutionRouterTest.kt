package dev.ally.phone.codex
import org.junit.Test
import org.junit.Assert.*
class PhoneExecutionRouterTest {
    @Test fun explicitPhoneTaskRoutesLocally(){assertEquals(PhoneExecutionRouter.Target.PHONE,PhoneExecutionRouter.target("Open notes on my phone"))}
    @Test fun desktopTaskStaysOnPc(){assertEquals(PhoneExecutionRouter.Target.PC,PhoneExecutionRouter.target("Fix the desktop codebase"))}
    @Test fun mixedAndAmbiguousNeedAChoice(){for(t in listOf("Look at this","Use my phone and desktop together","Help with homework"))assertEquals(PhoneExecutionRouter.Target.CHOOSE,PhoneExecutionRouter.target(t))}
}
