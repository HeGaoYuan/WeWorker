#define MyAppName "Webwright"
#define MyAppVersion "0.1.0"
#define MyAppExeName "Webwright.exe"
#ifndef MyAppSource
  #define MyAppSource "..\build\dist\Webwright"
#endif
#ifndef MyOutputDir
  #define MyOutputDir "Output"
#endif

[Setup]
AppId={{6D3F31B5-E9C8-4D54-B307-CF428921CE8E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\Webwright
PrivilegesRequired=lowest
OutputDir={#MyOutputDir}
OutputBaseFilename=Webwright-windows-x64-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "{#MyAppSource}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Webwright"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Webwright"; Flags: nowait postinstall skipifsilent
