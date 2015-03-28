//-------------------------------------------------------------------------------------------------
// <copyright file="BalExtension.cs" company="Outercurve Foundation">
//   Copyright (c) 2004, Outercurve Foundation.
//   This software is released under Microsoft Reciprocal License (MS-RL).
//   The license and further copyright text can be found in the file
//   LICENSE.TXT at the root directory of the distribution.
// </copyright>
//
// <summary>
// The Windows Installer XML Toolset Bal extension.
// </summary>
//-------------------------------------------------------------------------------------------------

namespace Microsoft.Tools.WindowsInstallerXml.Extensions
{
    using System;
    using System.Reflection;

    /// <summary>
    /// The Windows Installer XML Toolset Bal Extension.
    /// </summary>
    public sealed class BalExtension : WixExtension
    {
        private BalCompiler compilerExtension;
        private Library library;
        private TableDefinitionCollection tableDefinitions;

        private BalPreprocessorExtension preprocessorExtension;

        /// <summary>
        /// Gets the optional compiler extension.
        /// </summary>
        /// <value>The optional compiler extension.</value>
        public override CompilerExtension CompilerExtension
        {
            get
            {
                if (null == this.compilerExtension)
                {
                    this.compilerExtension = new BalCompiler();
                }

                return this.compilerExtension;
            }
        }

        /// <summary>
        /// Gets the optional table definitions for this extension.
        /// </summary>
        /// <value>The optional table definitions for this extension.</value>
        public override TableDefinitionCollection TableDefinitions
        {
            get
            {
                if (null == this.tableDefinitions)
                {
                    this.tableDefinitions = LoadTableDefinitionHelper(Assembly.GetExecutingAssembly(), "Microsoft.Tools.WindowsInstallerXml.Extensions.Data.tables.xml");
                }

                return this.tableDefinitions;
            }
        }

        /// <summary>
        /// Gets the library associated with this extension.
        /// </summary>
        /// <param name="tableDefinitions">The table definitions to use while loading the library.</param>
        /// <returns>The loaded library.</returns>
        public override Library GetLibrary(TableDefinitionCollection tableDefinitions)
        {
            if (null == this.library)
            {
                this.library = LoadLibraryHelper(Assembly.GetExecutingAssembly(), "Microsoft.Tools.WindowsInstallerXml.Extensions.Data.balExt.wixlib", tableDefinitions);
            }

            return this.library;
        }

        /// <summary>
        /// Gets the optional preprocessor extension.
        /// </summary>
        /// <value>The optional preprocessor extension.</value>
        public override PreprocessorExtension PreprocessorExtension
        {
            get
            {
                if (null == this.preprocessorExtension)
                {
                    this.preprocessorExtension = new BalPreprocessorExtension();
                }

                return this.preprocessorExtension;
            }
        }
    }
}
