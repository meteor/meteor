//-------------------------------------------------------------------------------------------------
// <copyright file="ValuePreprocessorExtension.cs" company="">
// </copyright>
//
// <summary>
// A WiX preprocessor extension.
// </summary>
//-------------------------------------------------------------------------------------------------

namespace Microsoft.Tools.WindowsInstallerXml.Extensions
{
    using System;
    using Microsoft.Tools.WindowsInstallerXml;

    /// <summary>
    /// The preprocessor extension.
    /// </summary>
    public sealed class BalPreprocessorExtension : PreprocessorExtension
    {
        private static readonly string[] prefixes = {"bal"};

        /// <summary>
        /// Gets the variable prefixes for this extension.
        /// </summary>
        /// <value>The variable prefixes for this extension.</value>
        public override string[] Prefixes
        {
            get { return prefixes; }
        }

        public override string EvaluateFunction(string prefix, string function, string[] args)
        {
            string result = null;

            switch (prefix)
            {
                case "bal":
                    switch (function)
                    {
                        case "Version":
                            // Make sure the base version is specified
                            if (args.Length == 0 || args[0].Length == 0)
                            {
                                throw new ArgumentException("Version template not specified");
                            }

                            // Build = days since 1/1/2000; Revision = seconds since midnight / 2
                            DateTime now = DateTime.Now.ToUniversalTime();
                            double build = (now - new DateTime(2000, 1, 1)).TotalDays;
                            double revision = now.TimeOfDay.TotalSeconds / 2;

                            result = String.Format("{0}.{1}.{2}", args[0], (int)build, (int)revision);

                            break;
                    }

                    break;
            }

            return result;
        }
    }
}
