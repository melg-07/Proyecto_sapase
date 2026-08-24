$manager = New-Object -ComObject WIA.DeviceManager

foreach ($info in $manager.DeviceInfos) {

    $name = $info.Properties("Name").Value

    Write-Host ""
    Write-Host "===================================="
    Write-Host "DISPOSITIVO: $name"
    Write-Host "===================================="

    $device = $info.Connect()

    Write-Host ""
    Write-Host "PROPIEDADES DEL DEVICE:"
    Write-Host ""

    foreach ($prop in $device.Properties) {

        try {
            Write-Host "ID: $($prop.PropertyID)  Valor: $($prop.Value)"
        }
        catch {
            Write-Host "ID: $($prop.PropertyID)  Valor: [NO DISPONIBLE]"
        }
    }

    $item = $device.Items.Item(1)

    Write-Host ""
    Write-Host "PROPIEDADES DEL ITEM:"
    Write-Host ""

    foreach ($prop in $item.Properties) {

        try {
            Write-Host "ID: $($prop.PropertyID)  Valor: $($prop.Value)"
        }
        catch {
            Write-Host "ID: $($prop.PropertyID)  Valor: [NO DISPONIBLE]"
        }
    }
}