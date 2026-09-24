using System;
using System.Windows.Forms;

namespace BJ.Integrador.Monitor;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new FormMain());
    }
}
