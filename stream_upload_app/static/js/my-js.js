async function uploadWdg(uploadUrl) {
    var fileInput = document.getElementById('fileWdgId');
    var fileAttr = fileInput.files[0];
    var filename = fileInput.files[0].name;

    document.getElementById('display').innerHTML = 
        'Uploading ' + filename;

    let formData = new FormData();
    formData.append('file', fileAttr);

    let uploadEndpoint = `${window.origin}` + uploadUrl
    
    try {
        let response = await fetch(uploadEndpoint, {
            method: "POST",
            body: formData,
        });
        if (!response.ok) {
            throw new Error('Network response was not OK');
        }
        let result = await response.json();
        
        if (result.hasOwnProperty('error')) {
            var resultStr = result['error'];
        } else {
            var resultStr = 'Finished';
            let bkm = Bokeh.documents[0].get_model_by_name('uploadMetaData')
            bkm.text = JSON.stringify(result);
        }
        document.getElementById('display').innerHTML = resultStr;
    } catch(e) {
        console.log(e);
        document.getElementById('display').innerHTML = 'Unknown error';
    }
};