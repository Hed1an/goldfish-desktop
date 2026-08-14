; DeepSeek Harness Desktop — 安装器自定义
; 在"选择安装目录"之后插入一页:可选择是否创建桌面快捷方式
!include "nsDialogs.nsh"

Var /GLOBAL gfShortcutCheckbox
Var /GLOBAL gfShortcutChoice

!macro customPageAfterChangeDir
  Page custom gfShortcutPageCreate gfShortcutPageLeave
!macroend

Function gfShortcutPageCreate
  !insertmacro MUI_HEADER_TEXT "快捷方式选项" "选择要创建的快捷方式"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 12u 100% 16u "创建桌面快捷方式(&D)"
  Pop $gfShortcutCheckbox
  ${NSD_Check} $gfShortcutCheckbox
  ${NSD_CreateLabel} 0 36u 100% 32u "取消勾选则不创建桌面快捷方式$(;)。开始菜单快捷方式始终创建。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function gfShortcutPageLeave
  ${NSD_GetState} $gfShortcutCheckbox $0
  StrCpy $gfShortcutChoice $0
FunctionEnd

!macro customInstall
  ; 用户取消勾选:删除刚创建的桌面快捷方式
  ${If} $gfShortcutChoice == 0
    Delete "$newDesktopLink"
  ${EndIf}
!macroend
