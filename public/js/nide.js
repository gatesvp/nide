var socket = io.connect(window.location.origin, {'connect timeout': 25000});

var currentFile

var cwd = ''
var nodeVersion = 'v0.4.11'

var searchResultHtmlElementByPath
var fileHtmlElementByPath
var stateByPath = {}
var fileEntries = []
var packages = []
var updatePackages = function() {}

var ignore = ['.git', '.nide', '.DS_Store']
var limitRecursion = ['node_modules']

var addHTMLElementForFileEntry = function(entry, parentElement, fileEntriesArray, htmlElementByPathTable, ownContext, doLimitRecursion) {
    
    if (ignore.indexOf(entry.name) != -1) {
        return;
    }
    
    var thisElement = document.createElement("li");
    htmlElementByPathTable[entry.path] = thisElement
    
    if (fileEntriesArray && !doLimitRecursion) {
        fileEntriesArray.push(entry)
    }
    
    if (entry.type == "directory") {
        thisElement.className = 'folder'
        if (stateByPath[entry.path] == 'open') {
            thisElement.className += ' open'
        }
        thisElement.innerHTML = '<img src="img/folder.png">' + entry.name + (ownContext ? (' <i>(' + entry.path + ')</i>') : '')
        $(thisElement).click(function(e) {
            if (!e.offsetX) e.offsetX = e.clientX - $(e.target).position().left;
            if (!e.offsetY) e.offsetY = e.clientY - $(e.target).position().top;
            if (e.target == thisElement && e.offsetY < 24) {
                if (e.offsetX < 24) {
                    $(this).toggleClass('open');
                    stateByPath[entry.path] = $(this).hasClass('open') ? 'open' : '';
                    e.stopPropagation()
                } else {
                    selectFile(entry, htmlElementByPathTable)
                    e.stopPropagation()
                }
            }
        })
        var ul = document.createElement("ul")
        thisElement.appendChild(ul)
        for (var childEntry in entry.children) {
            addHTMLElementForFileEntry(entry.children[childEntry], ul, fileEntriesArray, ownContext ? {} : htmlElementByPathTable, false, doLimitRecursion || limitRecursion.indexOf(entry.name) != -1)
        }
    } else {
        thisElement.innerHTML = '<img src="img/file.png">' + entry.name + (ownContext ? (' <i>(' + entry.path + ')</i>') : '')
        $(thisElement).click(function(e) {
            selectFile(entry, htmlElementByPathTable)
        })
    }
    if (entry.name.charAt(0) == '.') {
        thisElement.className += ' hidden'
    }
    parentElement.appendChild(thisElement)
}

socket.on('cwd', function(path) {
    cwd = path
})

socket.on('node-version', function(version) {
    nodeVersion = version
})

socket.on('packages', function(reportedPackages) {
    packages = reportedPackages
    updatePackages()
})

socket.on('welcome', function() {
    $('#lightbox').fadeIn()
    $('.setup form').bind('submit', function(e) {
        var name = $(".setup input[name='name']")[0].value;
        var description = $(".setup input[name='description']")[0].value;
        var author = $(".setup input[name='author']")[0].value;
        var version = $(".setup input[name='version']")[0].value;
        if (!version.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
            alert('Please enter the version number in the X.Y.Z format.')
            e.preventDefault();
            return;
        }
        e.preventDefault()
        socket.emit('add', '/package.json')
        socket.emit('save', { path: '/package.json', content: JSON.stringify({
            name: name,
            description: description,
            version: version,
            author: author,
            dependencies: {},
            devDependencies: {}
        }, undefined, '    ')})
        $('#lightbox').fadeOut()
        socket.emit('skip-welcome')
    })
    $('.setup .skip').click(function(){
        $('#lightbox').fadeOut()
        socket.emit('skip-welcome')
    })
})

socket.on('list', function (data) {
    searchResultHtmlElementByPath = {}
    fileHtmlElementByPath = {}
    fileEntries = []
    var ul = document.createElement("ul")
    for (var childEntry in data.children) {
        addHTMLElementForFileEntry(data.children[childEntry], ul, fileEntries, fileHtmlElementByPath)
    }
    document.getElementById('files').innerHTML = '';
    document.getElementById('files').appendChild(ul);
    ul = document.createElement("ul")
    for (var i = 0; i < fileEntries.length; i++) {
        addHTMLElementForFileEntry(fileEntries[i], ul, null, searchResultHtmlElementByPath, true)
    }
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-results').appendChild(ul);
});

$(function(){
    $('#show-hidden').click(function() {
        $('#sidebar').toggleClass('show-hidden')
    })
    
    var doSearch = function() {
        if (this.value != '') {
            for (var i = 0; i < fileEntries.length; i++) {
                if (fileEntries[i].name.match(this.value)) {
                    $(searchResultHtmlElementByPath[fileEntries[i].path]).slideDown()
                } else {
                    $(searchResultHtmlElementByPath[fileEntries[i].path]).slideUp()
                }
            }
            $('#project').slideUp();
            $('#search').slideDown();
        } else {
            $('#project').slideDown();
            $('#search').slideUp();
        }
    }
    $('#search-field').keyup(doSearch).click(doSearch)
    
    $('#project').click(function(e) {
        if (e.target == $('#project')[0]) {
            selectFile({
                type: 'project',
                path: '/'
            }, null, $('#project')[0])
        }
    })

    $('#npm').click(function(e) {
        if (e.target == $('#npm')[0]) {
            selectFile({
                type: 'npm',
                path: '/'
            }, null, $('#npm')[0])
        }
    })
    
    $('#docs').click(function(e) {
        if (e.target == $('#docs')[0]) {
            selectFile({
                type: 'documentation',
                path: '/'
            }, null, $('#docs')[0])
        }
    })

    $('#add-file').click(function(e) {
        var filename = prompt('Type in a filename for the new file:', 'untitled.js')
        if (filename) {
            addFile(filename)
        }
    })
    
    $('#add-folder').click(function(e) {
        var filename = prompt('Type in a filename for the new folder', 'folder')
        if (filename) {
            addFolder(filename)
        }
    })
    
    $('#remove-file').click(function(e) {
        if (currentFile) {
            var confirmed
            if (currentFile.type == 'file') {
                confirmed = confirm('Are you sure?')
            } else if (currentFile.type == 'directory') {
                confirmed = confirm('This will remove the directory and all its contents. Are you sure?')
            } else {
                confirmed = false
            }
            if (confirmed) {
                removeFile()
            }
        }
    })
})

var renameFile = function(oldpath, newpath) {
    socket.emit('rename', { oldpath: oldpath, newpath: newpath })
}

var removeFile = function() {
    socket.emit('remove', currentFile.path)
}

var addFolder = function(filename) {
    var path;
    if (!currentFile) {
        path = '/'
    } else {
        switch(currentFile.type) {
            case 'directory':
                path = currentFile.path + '/'
                break;
            case 'file':
                path = currentFile.path.replace(/\/[^\/]+$/, '/')
                break;
            default:
                path = '/'
                break;
        }
    }
    socket.emit('add-folder', path + filename);
}

var addFile = function(filename) {
    var path;
    if (!currentFile) {
        path = '/'
    } else {
        switch(currentFile.type) {
            case 'directory':
                path = currentFile.path + '/'
                break;
            case 'file':
                path = currentFile.path.replace(/\/[^\/]+$/, '/')
                break;
            default:
                path = '/'
                break;
        }
    }
    socket.emit('add', path + filename);
}

var loadFileCallbacks = {}
var loadFile = function(path, callback) {
    socket.emit('load', path)
    if (!loadFileCallbacks[path]) {
        loadFileCallbacks[path] = [callback]
    } else {
        loadFileCallbacks[path].push(callback)
    }
}

socket.on('file', function(data) { 
    var callbacks = loadFileCallbacks[data.path] || []
    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](data.error, data.file)
    }
    delete loadFileCallbacks[data.path]
})

var saveFileCallbacks = {}
var saveFile = function(path, content, callback) {
    socket.emit('save', {path: path, content: content})
    if (!saveFileCallbacks[path]) {
        saveFileCallbacks[path] = [callback]
    } else {
        saveFileCallbacks[path].push(callback)
    }
}

socket.on('save-success', function(data) { 
    var callbacks = saveFileCallbacks[data.path] || []
    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](null)
    }
    delete saveFileCallbacks[data.path]
})

socket.on('save-error', function(data) { 
    var callbacks = saveFileCallbacks[data.path] || []
    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](data.error)
    }
    delete saveFileCallbacks[data.path]
})

var versionsCallbacks = {}
var loadVersions = function(path, callback) {
    socket.emit('versions', path)
    if (!versionsCallbacks[path]) {
        versionsCallbacks[path] = [callback]
    } else {
        versionsCallbacks[path].push(callback)
    }
}

socket.on('versions', function(data) { 
    var callbacks = versionsCallbacks[data.path] || []
    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](data.error, data.versions)
    }
    delete versionsCallbacks[data.path]
})

var versionCallbacks = {}
var loadVersion = function(uuid, callback) {
    socket.emit('version', uuid)
    if (!versionCallbacks[uuid]) {
        versionCallbacks[uuid] = [callback]
    } else {
        versionCallbacks[uuid].push(callback)
    }
}

socket.on('version-success', function(data) { 
    var callbacks = versionCallbacks[data.uuid] || []
    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](null, data.content)
    }
    delete versionCallbacks[data.uuid]
})

socket.on('version-error', function(data) { 
    var callbacks = versionCallbacks[data.uuid] || []
    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](data.error)
    }
    delete versionCallbacks[data.uuid]
})

var CodeEditor = function(entry) {
    var createCodeMirror = function(parentNode, file, path, options) {
    	var mode = undefined;
        if (path.match(/\.js$/)) {
            mode = 'javascript';
        } else if (path.match(/\.coffee$/)) {
            mode = 'coffeescript';
        } else if (path.match(/\.json$/)) {
            mode = { name: 'javascript', json: true };
        } else if (path.match(/\.x?html?$/)) {
	    mode = 'htmlmixed';
        } else if (path.match(/\.php$/)) {
	    mode = 'php';
        } else if (path.match(/\.py$/)) {
            mode = 'python';
        } else if (path.match(/\.rb$/)) {
            mode = 'ruby';
        } else if (path.match(/\.lua$/)) {
            mode = 'lua';
        } else if (path.match(/\.(c|h|cpp|hpp|cc|m|cs|java)$/)) {
            mode = 'clike';
        } else if (path.match(/\.css$/)) {
            mode = 'css';
        } else if (path.match(/\.(xml|svg|od(t|p|s))$/)) {
            mode = 'xml';
        }
   
    	return CodeMirror(parentNode, {
            value: file,
            mode: mode,
            lineNumbers: true,
            onChange: options.onChange,
            readOnly: options.readOnly,
            enterMode: 'keep',
            electricChars: false,
            smartHome: true,
            matchBrackets: true
        });
    }
    var codeMirror;
    var galaxyBackground = document.createElement('div')
    galaxyBackground.innerHTML = 
        '<h1 class="now">Now</h1>' +
        '<h1 class="then">Then</h1>' +
        '<button class="done">Done</button>' +
        '<button class="revert">Revert</button>' +
        '<button class="backward" title="Go backward in time"><img src="img/backward.png"</button>' +
        '<button class="forward" title="Go forward in time"><img src="img/forward.png"</button>';
    var editor = document.createElement('div')
    var versionEditors = []
    var actionsBar = document.createElement('div')
    actionsBar.className = 'actions'
    actionsBar.innerHTML = '<b>' + cwd + entry.path + '</b> '
    var renameButton = document.createElement('button')
    renameButton.innerHTML = 'Rename'
    $(renameButton).click(function(e) {
        var newName = prompt('New filename:', entry.name)
        if (newName) {
            renameFile(entry.path, entry.path.replace(/\/[^\/]+$/, '/' + newName))
        }
    })
    actionsBar.appendChild(renameButton)
    var versionsButton = document.createElement('button')
    versionsButton.innerHTML = 'Versions'
    var time = 1000;
    var noPreviousMessage
    $(versionsButton).click(function(e) {
        loadVersions(entry.path, function(err, versions) {
            var currentVersion = versions.length - 1;
            if (err) return;
            $(actionsBar).slideUp(time);
            $(galaxyBackground).animate({
                left: '-250px'
            }, time)
            $(editor).animate({
                left: '5%',
                top: '50px',
                bottom: '50px',
                right: '52.5%'
            }, time).addClass('windowed')
            if (versions.length == 0) {
                noPreviousMessage = document.createElement('div')
                noPreviousMessage.innerHTML = 'There are no previous versions for this file.'
                noPreviousMessage.className = 'no-previous'
                galaxyBackground.appendChild(noPreviousMessage)
                $(".revert, .backward, .forward", galaxyBackground).hide()
            } else {
                $(".revert, .backward, .forward", galaxyBackground).show()
            }
            $(".then", galaxyBackground).html((new Date(versions[currentVersion].date)).toString())
            for (var i = 0; i < versions.length; i++) {
                var version = versions[i]
                var versionEditor = document.createElement('div')
                versionEditor.className = 'code-editor'
                versionEditor.style.zIndex = 98;
                versionEditors.push(versionEditor)
                galaxyBackground.appendChild(versionEditor)
                $(versionEditor).animate({
                    right: '5%',
                    top: '50px',
                    bottom: '50px',
                    left: '52.5%'
                }, time).addClass('windowed');
                (function(versionEditor, i) {
                    loadVersion(version.uuid, function(err, contents) {
                        if (err) {
                            contents = '<ERROR: Could not load file contents>'
                        }
                        var codeMirror = createCodeMirror(versionEditor, contents, entry.path, { readOnly: true })
                        versions[i].content = contents;
                    })
                })(versionEditor, i);
                if (versions.length - 1 - i > 3) {
                    $(versionEditor).hide()
                } else {
                    $(versionEditor).css({
                        scale: (1 - (versions.length - 1 - i) * 0.05),
                        translateY: -(versions.length - 1 - i)*20,
                        opacity: (1 - (versions.length - 1 - i) * (1/3))
                    })
                }
            }
            var goVersion = function(delta) {
                currentVersion += delta;
                if (currentVersion >= versions.length) {
                    currentVersion = versions.length - 1;
                }
                if (currentVersion <= 0) {
                    currentVersion = 0;
                }
                $(".then", galaxyBackground).html((new Date(versions[currentVersion].date)).toString())
                for (var i = 0; i < versions.length; i++) {
                    var version = versions[i]
                    var versionEditor = versionEditors[i]
                    var hidden = false;
                    if (currentVersion - i > 3) {
                        $(versionEditor).fadeOut()
                        hidden = true
                    } else if (currentVersion - i < 0) {
                        $(versionEditor).fadeOut()
                        hidden = true
                    } else {
                        $(versionEditor).fadeIn()
                    }
                    if (hidden) {
                        $(versionEditor).animate({
                            scale: (1 - (currentVersion - i) * 0.05),
                            translateY: -(currentVersion - i)*20,
                        }, { queue: false })
                    } else {
                        $(versionEditor).animate({
                            scale: (1 - (currentVersion - i) * 0.05),
                            translateY: -(currentVersion - i)*20,
                            opacity: (1 - (currentVersion - i) * (1/3))
                        }, { queue: false })
                    }
                }
            }
            $(".backward", galaxyBackground).unbind('click').click(function(){
                goVersion(-1)
            })
            $(".forward", galaxyBackground).unbind('click').click(function(){
                goVersion(1)                
            })
            $(".revert", galaxyBackground).unbind('click').click(function(){
                versionEditors[currentVersion].style.zIndex = 100
                $(versionEditors[currentVersion]).animate({
                    left: '5%',
                    top: '50px',
                    bottom: '50px',
                    right: '52.5%'
                }, time, function() {
                    codeMirror.setValue(versions[currentVersion].content)
                    $(versionEditors[currentVersion]).hide()
                    $(".done").click()
                })
            })
        })
    })
    $(".done", galaxyBackground).click(function(e) {
        $(actionsBar).slideDown(time);
        $(galaxyBackground).animate({
            left: 0
        }, time)
        $(editor).animate({
            left: '0%',
            top: '0px',
            bottom: '0px',
            right: '0%'
        }, time, function() {
            $(editor).removeClass('windowed')
            for (var i = 0; i < versionEditors.length; i++) {
                galaxyBackground.removeChild(versionEditors[i])
            }
            versionEditors = []
            if (noPreviousMessage) {
                galaxyBackground.removeChild(noPreviousMessage)
                noPreviousMessage = undefined
            }
        })
    })
    actionsBar.appendChild(versionsButton)
    editor.appendChild(actionsBar)
    editor.className = 'code-editor'
    loadFile(entry.path, function(err, file) {
        codeMirror = createCodeMirror(editor, file, entry.path, { onChange: function(editor) {
            content = editor.getValue()
            changed = true
        }})
        
        var content = file
        var changed = false;
        var saving = false;
        
        setInterval(function() {
            if (changed && !saving) {
                var done = false;
                saving = true;
                var selected = $('.selected')
                selected.addClass('syncing')
                saveFile(entry.path, content, function(err){
                    if (!err) {
                        changed = false
                        done = true;
                        selected.removeClass('syncing')
                    }
                    saving = false
                })
                setTimeout(function() {
                    if (!done) {
                        saving = false
                    }
                }, 8000)
            }
        }, 3000)
    })
    galaxyBackground.appendChild(editor)
    galaxyBackground.className = 'galaxy-background'
    return galaxyBackground
}

var DirectoryEditor = function(entry) {
    var editor = document.createElement('div')
    editor.className = 'directory-editor'
    var actionsBar = document.createElement('div')
    actionsBar.className = 'actions'
    actionsBar.innerHTML = '<b>' + cwd + entry.path + '</b> '
    var renameButton = document.createElement('button')
    renameButton.innerHTML = 'Rename'
    $(renameButton).click(function(e) {
        var newName = prompt('New folder name:', entry.name)
        if (newName) {
            renameFile(entry.path, entry.path.replace(/\/[^\/]+$/, '/' + newName))
        }
    })
    actionsBar.appendChild(renameButton)
    editor.appendChild(actionsBar)
    return editor
}

var documentationIframe
var DocumentationViewer = function(entry) {
    var editor = document.createElement('div')
    editor.className = 'documentation-viewer'
    if (!documentationIframe) {
        documentationIframe = document.createElement('iframe')
        documentationIframe.src = 'http://nodejs.org/docs/' + nodeVersion + '/api/index.html'
    }
    editor.appendChild(documentationIframe)
    return editor
}

socket.on('install-error', function(message) {
    alert('Could not install package:\n\n' + message)
})

socket.on('uninstall-error', function(message) {
    alert('Could not uninstall package:\n\n' + message)
})

var NPMEditor = function(entry) {
    var editor = document.createElement('div')
    var sidebarEntry = $('.selected')
    editor.className = 'npm-editor'
    editor.innerHTML = 
        '<div class="actions"><b>Node Package Manager - Installed Packages</b> <button class="refresh">Refresh</button></div>' +
        '<div class="actions"><select multiple class="packages"></select></div>' +
        '<div class="actions">' +
        '<button class="gradient add"><img src="img/add.png"></button>' + 
        '<button class="gradient remove"><img src="img/remove.png"></button> ' +
        '<label><input type="checkbox" checked class="save"> Register packages on <code>package.json</code> on install.</label>'
        '</div>'
    updatePackages = function() {
        $(".packages", editor)[0].innerHTML = '';
        for (var i = 0; i < packages.length; i++) {
            var pack = document.createElement("option")
            pack.className = 'package'
            if (packages[i].match(/  extraneous$/)) {
                pack.className += ' extraneous';
            }
            if (packages[i].match(/^UNMET DEPENDENCY /)) {
                pack.className += ' unmet';
            }
            pack.innerHTML = packages[i]
            pack.value = packages[i]
            $(".packages", editor).append(pack)
        }
        sidebarEntry.removeClass('syncing')
    }
    updatePackages()
    $(".add", editor).click(function(){
        var package = prompt('Package to be installed:', 'package-name')
        var save = $(".save", editor)[0].checked
        if (package) {
            socket.emit('install', { package: package, save: save })
            sidebarEntry.addClass('syncing')
        }
    })
    $(".remove", editor).click(function(){
        if (confirm('Are you sure?')) {
            var packageSelect = $(".packages", editor)[0]
            var selected = [];
            for (var i = 0; i < packageSelect.options.length; i++) {
                if (packageSelect.options[i].selected) {
                    selected.push(packageSelect.options[i].value.replace(/  extraneous$/,'').replace(/\@.+$/,''));
                }
            }
            if (selected.length > 0) {
                var save = $(".save", editor)[0].checked
                socket.emit('uninstall', { package: selected.join(' '), save: save })
                sidebarEntry.addClass('syncing')
            }
        }
    })
    $(".refresh", editor).click(function(){
        socket.emit('packages-refresh')
        sidebarEntry.addClass('syncing')
    })
    return editor
}

var setCurrentEditor = function(editor) {
    $('#content')[0].innerHTML = ''
    $('#content').append(editor)
}

var selectFile = function(entry, htmlElementByPathTable, htmlElement) {
    $('.selected').removeClass('selected')
    currentFile = entry
    $(htmlElement || htmlElementByPathTable[currentFile.path]).addClass('selected')
    
    var editor;
    switch(entry.type) {
        case "file":
            editor = new CodeEditor(entry)
        break;
        case "directory":
            editor = new DirectoryEditor(entry)
        break;
        case "documentation":
            editor = new DocumentationViewer(entry)
        break;
        case "npm":
            editor = new NPMEditor(entry)
        break;
    }
        
    setCurrentEditor(editor)
}

