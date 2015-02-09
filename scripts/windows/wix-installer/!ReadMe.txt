    Meteor WiX Installer
   ======================

In order to build Meteor installer following tools are required:
	Visual Stidio 2010 or later
	WiX Toolset 3.8 or later


So, the installer was made using WiX Toolset and it uses a custom made WiX extension for boostratpper
project (WixBalExtensionExt.dll), for an improved GUI of bootstrapper application.
The WiX extension was developed on a different solution: WiXBalExtension\BalExtensionExt.sln

The project have following folders structure:

   + Release					 - The folder where the compiled installer will be placed
   |
   + WiXBalExtension             - Contain the solution of WiX extension of bootstrapper application
   |
   + WiXCustomAction             - C++ custom action project of the lib that contains custom actions  
   |                               used in MSI projects
   |    
   + WiXInstaller                - Contain the setup projects of Meteor MSI package and boostratpper project
        |
        - Resources              - Resources files used on both, MSI and bootsreapper projects.


The WixBalExtensionExt.dll library was build using VisualStudio 2010, so, if you want to use a differnt one
please make sure that you update Platform Toolset and paths of include/libs on C++ projects

