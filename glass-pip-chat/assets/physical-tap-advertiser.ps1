param([switch]$Probe)
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 provides the supported Windows Runtime projection.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
function Await-WinRT($Operation, [Type]$ResultType) {
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (-not $task.Wait(5000)) { throw 'Bluetooth adapter query timed out' }
    $task.Result
}
$publisher = $null
try {
    $adapterType = [Windows.Devices.Bluetooth.BluetoothAdapter,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]
    $adapter = Await-WinRT ($adapterType::GetDefaultAsync()) $adapterType
    if ($null -eq $adapter) { throw 'No Windows Bluetooth adapter' }
    $capability = @{ type='capability'; lowEnergy=$adapter.IsLowEnergySupported; peripheral=$adapter.IsPeripheralRoleSupported; extended=$adapter.IsExtendedAdvertisingSupported }
    if ($Probe) { $capability | ConvertTo-Json -Compress; exit 0 }
    if (-not $adapter.IsLowEnergySupported -or -not $adapter.IsPeripheralRoleSupported) { throw 'Windows adapter does not support BLE peripheral advertising' }
    # Only a random public locator crosses stdin. No pairing key or socket credential.
    $token = [Console]::ReadLine()
    if ($token -notmatch '^[a-f0-9]{32}$') { throw 'Invalid public locator' }
    $payload = New-Object byte[] 20
    $payload[0]=0x41; $payload[1]=0x4c; $payload[2]=0x59; $payload[3]=0x31
    for ($i=0; $i -lt 32; $i+=2) { $payload[4+$i/2] = [Convert]::ToByte($token.Substring($i,2),16) }
    # Keep WinRT collections inside C#: PowerShell exposes their IVector as __ComObject.
    $framework = [Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
    $facades = Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8\Facades'
    $metadata = Get-ChildItem (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\UnionMetadata') -Filter Windows.winmd -Recurse | Where-Object { $_.Directory.Name -ne 'Facade' } | Sort-Object FullName -Descending | Select-Object -First 1
    if ($null -eq $metadata) { throw 'Windows SDK metadata missing; use manual screen review' }
    $compiler = New-Object Microsoft.CSharp.CSharpCodeProvider
    $parameters = New-Object System.CodeDom.Compiler.CompilerParameters
    $parameters.GenerateInMemory = $true
    $parameters.CompilerOptions = '/nostdlib+'
    [void]$parameters.ReferencedAssemblies.Add((Join-Path $framework 'mscorlib.dll'))
    foreach ($reference in @('System.dll', 'System.Core.dll', (Join-Path $framework 'System.Runtime.WindowsRuntime.dll'), (Join-Path $facades 'System.Runtime.dll'), (Join-Path $facades 'System.Collections.dll'), $metadata.FullName)) { [void]$parameters.ReferencedAssemblies.Add($reference) }
    $source = @'
using System;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Devices.Bluetooth.Advertisement;
public sealed class AllyTapRadio {
    private readonly BluetoothLEAdvertisementPublisher publisher = new BluetoothLEAdvertisementPublisher();
    private readonly System.Threading.Tasks.Task<string> stop = System.Threading.Tasks.Task.Run(() => Console.ReadLine());
    public AllyTapRadio(byte[] bytes) {
        publisher.Advertisement.ManufacturerData.Add(new BluetoothLEManufacturerData { CompanyId = 0xffff, Data = bytes.AsBuffer() });
    }
    public string Status { get { return publisher.Status.ToString(); } }
    public bool StopRequested { get { return stop.IsCompleted; } }
    public void Start() { publisher.Start(); }
    public void Stop() { publisher.Stop(); }
}
'@
    $compiled = $compiler.CompileAssemblyFromSource($parameters, $source)
    if ($compiled.Errors.HasErrors) { throw (($compiled.Errors | ForEach-Object { $_.ErrorText }) -join '; ') }
    [void]$compiled.CompiledAssembly
    $publisher = [AllyTapRadio]::new($payload)
    $publisher.Start()
    $elapsed = [Diagnostics.Stopwatch]::StartNew()
    while ($publisher.Status.ToString() -eq 'Waiting' -or $publisher.Status.ToString() -eq 'Created') {
        if ($elapsed.Elapsed.TotalSeconds -gt 5) { throw 'Windows BLE publisher did not start in five seconds' }
        Start-Sleep -Milliseconds 100
    }
    if ($publisher.Status.ToString() -ne 'Started') { throw ('Windows BLE publisher status: ' + $publisher.Status) }
    @{type='started'} | ConvertTo-Json -Compress
    $elapsed.Restart()
    while (-not $publisher.StopRequested -and $elapsed.Elapsed.TotalSeconds -lt 35) {
        if ($publisher.Status.ToString() -ne 'Started') { throw ('Windows BLE publisher stopped: ' + $publisher.Status) }
        Start-Sleep -Milliseconds 100
    }
} catch {
    @{type='error'; reason=$_.Exception.Message} | ConvertTo-Json -Compress
    exit 1
} finally { if ($null -ne $publisher) { $publisher.Stop() } }
