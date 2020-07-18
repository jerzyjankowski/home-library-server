const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const ObjectId = require('mongoose').Types.ObjectId;
const multer  = require('multer')
const uniqueString  = require('unique-string')
const fs  = require('fs')

const env = process.argv && process.argv.length >= 4
    && process.argv.indexOf('--env') !== -1 && process.argv.length > process.argv.indexOf('--env') + 1
    ? process.argv[process.argv.indexOf('--env') + 1] : 'garbage';
const port = process.argv && process.argv.length >= 4
    && process.argv.indexOf('--port') !== -1 && process.argv.length > process.argv.indexOf('--port') + 1
    ? +process.argv[process.argv.indexOf('--port') + 1] : 3001;

const app = express();
app.use(bodyParser.json({extended: true}));
mongoose.connect(`mongodb://localhost:27017/books-${env}`, {useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set('useFindAndModify', false);

const caseInsensitiveComparator = (x, y) => !x ? -1 : !y ? 1 : x.toLowerCase().localeCompare(y.toLowerCase());

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname + `/covers-${env}`)
    },
    filename: function (req, file, cb) {
        cb(null, uniqueString() + '.png')
    }
})
const upload = multer({ storage: storage })

const bookSchema = new mongoose.Schema({
    media: String,

    recommendation: String,
    state: String,
    marked: Boolean,
    archived: Boolean,

    rootTitle: String,
    title: String,
    authors: String,
    coverUrl: String,
    edition: Number,
    publisher: String,
    publishedYear: Number,
    pagesNumber: Number,

    category: String,
    subcategory: String,
    tags: [String],

    sources: [{name: String, location: String}],

    note: String,
    description: String,

    readings: [{date: String, note: String}],

    createdAt: String,
    attributesSortString: String,
});
const Book = mongoose.model('Book', bookSchema);




app.get('/books', function(req, res){
    Book.find(function (err, books) {
        if (err) return console.error(err);
        res.send(books.map(mapBookForReturn));
    })
});

app.get('/filter-books', function(req, res){
    const conditions = {
        title: { "$regex": req.query.title, "$options": "i" },
        recommendation: {$in: getArrayOf(req.query.recommendation)},
        state: {$in: getArrayOf(req.query.state)},
        marked: {$in: getArrayOf(req.query.marked)},
        archived: {$in: getArrayOf(req.query.archived)},
        media: {$in: getArrayOf(req.query.media)},
    }
    if (req.query.tags) {
        conditions.tags = { $all: req.query.tags }
    }
    if (req.query.sourceName) {
        conditions["sources.name"] = req.query.sourceName;
    }
    Book.find(conditions, function (err, books) {
        if (err) return console.error(err);
    }).sort({'attributesSortString': 1, 'publishedYear': -1, 'title': 1}).then((books) => {
        const pageSize = 10;
        const maxPage = Math.ceil(books.length / pageSize);
        const page = req.query.page;
        const currentPage = page > maxPage ? 1 : page;
        const startBook = (currentPage - 1) * pageSize;
        res.send({ books: books.slice(startBook, startBook + pageSize).map(mapBookForReturn), currentPage: currentPage, maxPage: maxPage });
    });
});

app.get('/matched-books', function(req, res){
    if (!req.query.title && !req.query.authors) {
        res.send([]);
    }
    const conditions = [];
    if (req.query.title) {
        conditions.push({title: {"$regex": req.query.title.split(/\W+/).splice(0, 4).join('.+'), "$options": "i"}});
    }
    if (req.query.authors) {
        conditions.push({authors: {"$regex": req.query.authors.split(/\W+/).splice(0, 2).join('.+'), "$options": "i"}});
    }
    Book.find({$or: conditions}, function (err, books) {
        if (err) return console.error(err);
    }).limit(11).then((books) => {
        res.send(books.map(mapBookForReturn));
    });
});

getArrayOf = function(queryParams) {
    if (queryParams === null || queryParams === undefined) {
        return [];
    }
    return typeof queryParams === 'string' ? [queryParams] : Array.from(queryParams);
}

app.get('/books/:bookId', function(req, res){
    Book.findById(req.params.bookId, function (err, book) {
        if (err) return console.error(err);
        res.send(mapBookForReturn(book));
    })
});

mapBookForReturn = function(book) {
    return {
        id: book._id,
        media: book.media, recommendation: book.recommendation, state: book.state, marked: book.marked, archived: book.archived,
        rootTitle: book.rootTitle, title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        edition: book.edition, publisher: book.publisher, publishedYear: book.publishedYear, pagesNumber: book.pagesNumber,
        category: book.category, subcategory: book.subcategory,
        tags: book.tags,
        sources: book.sources ? book.sources.map(source => new Object({name: source.name, location: source.location})) : [],
        note: book.note,
        description: book.description,
        readings: book.readings.map(reading => new Object({date: reading.date, note: reading.note}))
    }
}

mapBookForUpdate = function(book) {
    const attributesSortString = `${book.archived ? '1' : '0'}`
        + `${book.marked ? '0' : '1'}`
        + `${book.state === 'current' ? '0' : book.state === 'paused' ? '1' : book.state === 'finished' ? '2' : '3'}`
        + `${book.recommendation === 'recommended' ? '0' : book.recommendation === 'notRecommended' ? '2' : '1'}`;
    return {
        media: book.media, recommendation: book.recommendation, state: book.state, marked: book.marked, archived: book.archived,
        rootTitle: book.rootTitle, title: book.title,
        authors: book.authors,
        coverUrl: book.coverUrl,
        edition: book.edition, publisher: book.publisher, publishedYear: book.publishedYear, pagesNumber: book.pagesNumber,
        category: book.category, subcategory: book.subcategory,
        tags: book.tags,
        sources: book.sources ? book.sources.map(source => new Object({name: source.name, location: source.location})) : [],
        note: book.note,
        description: book.description,
        readings: book.readings.sort((r, s) => r.date.localeCompare(s.date)),
        attributesSortString: attributesSortString
    }
}

mapBookForCreate = function(book) {
    const d = new Date();
    const createdAt = `${d.getFullYear()}-${d.getMonth() < 9 ? '0' : ''}${d.getMonth()+1}-${d.getDate() < 10 ? '0' : ''}${d.getDate()}`
    const attributesSortString = `${book.archived ? '1' : '0'}`
        + `${book.marked ? '0' : '1'}`
        + `${book.state === 'current' ? '0' : book.state === 'paused' ? '1' : book.state === 'finished' ? '2' : '3'}`
        + `${book.recommendation === 'recommended' ? '0' : book.recommendation === 'notRecommended' ? '2' : '1'}`;
    book.readings.sort((r, s) => r.date.localeCompare(s.date));
    book.createdAt = createdAt;
    book.attributesSortString = attributesSortString;
    return book;
}

app.post('/books', upload.single('cover'), function (req, res, next) {
    const book = mapBookForCreate(new Book(JSON.parse(req.body.book)));
    book.coverUrl = req.file && req.file.filename ? `api/books/cover/` + req.file.filename : null;
    fillBookTagsWithCategoryAndSubcategoryAndSort(book);
    book.save().then(() => res.status(200).end()).catch(()=> res.send("error"));
});

app.put('/books/:bookId', upload.single('cover'), async function(req, res, next) {
    const bookToUpdate = mapBookForUpdate(new Book(JSON.parse(req.body.book)));
    fillBookTagsWithCategoryAndSubcategoryAndSort(bookToUpdate);
    if (req.file) {
        removeCoverOfBook(req.params.bookId)
        bookToUpdate.coverUrl = 'api/books/cover/' + req.file.filename;
    }
    Book.findOneAndUpdate({_id: new ObjectId(req.params.bookId)}, bookToUpdate, function (err, book) {
        if (err) return res.send(err);
        res.status(200).end();
    })
});

fillBookTagsWithCategoryAndSubcategoryAndSort = function(book) {
    if (!book.tags) {
        book.tags = [];
    }
    if (book.category && book.tags.indexOf(book.category) === -1) {
        book.tags.push(book.category)
    }
    if (book.category && book.tags.indexOf(book.subcategory) === -1) {
        book.tags.push(book.subcategory)
    }

    book.tags.sort(caseInsensitiveComparator)
}

removeCoverOfBook = async function(bookId) {
    await Book.findById(bookId, function (err, bookOld) {
        if (err) return console.error(err);
        if (bookOld.coverUrl) {
            fs.unlinkSync(__dirname + '/covers/' + bookOld.coverUrl.split('/')[3]);
        }
    })
}

app.get('/books/cover/:coverId', function(req, res){
    res.sendFile(`${__dirname}/covers-${env}/${req.params.coverId}`);
});

// unused, to delete
app.get('/tags', function(req, res) {
    Book.find({}, 'tags', function(err, books) {
        if (err) return console.error(err);
        const tagsSet = books.reduce((tags, book) => {book.tags.forEach(tags.add, tags);return tags;}, new Set())
        const tagsToReturn = [...tagsSet].sort();
        res.send(tagsToReturn);
    });
})

const preconfiguredTags = ['Android', 'Angular', 'AngularJS', 'Arduino', 'Axure UX', 'Backend', 'Backend', 'Blender',
    'Bootstrap', 'C lang', 'C#', 'C++', 'Clouds', 'Console', 'Data', 'Data Science', 'DBs', 'DevOps', 'Django',
    '.NET', 'ElasticSearch', 'Flask', 'Frontend', 'Games', 'Git', 'Go', 'Groovy', 'HTML and CSS', 'Hybrid Mobile',
    'IoT', 'Java', 'JavaFX', 'JavaScript', 'Jira', 'jQuery', 'LaTeX', 'Linux', 'MariaDB', 'Maven', 'MeteorJS',
    'Microservices', 'Mobile', 'MongoDB', 'MySQL', 'Network', 'Node.js', 'Objective-C', 'OpenCV', 'Other', 'PHP', 'PM',
    'PostgreSQL', 'PowerShell', 'Python', 'R', 'Rails', 'Raspberry Pi', 'ReactJS', 'Ruby', 'Scala', 'Security', 'Spark',
    'Spring', 'Swift', 'Testing', 'TypeScript', 'Unity', 'Unreal Engine', 'UX Design', 'Vue.js', 'WebGL', 'Wordpress',
    'Xamarin'];
const preconfiguredAvailableCategories = ['Backend', 'Frontend', 'Mobile', 'Data', 'DevOps', 'IoT', 'Other'];
const preconfiguredAvailableSubcategories = {
    'Backend': ['C lang', 'C#', 'C++', 'Django', '.NET', 'Flask', 'Go', 'Groovy', 'Java', 'JavaFX', 'Node.js', 'PHP', 'Python', 'R', 'Rails', 'Ruby', 'Scala', 'Spring'],
    'Frontend': ['Angular', 'AngularJS', 'Bootstrap', 'HTML and CSS', 'JavaScript', 'jQuery', 'MeteorJS', 'ReactJS', 'TypeScript', 'Vue.js', 'WebGL', 'Wordpress'],
    'Mobile': ['Android', 'Hybrid Mobile', 'Objective-C', 'Swift', 'Xamarin'],
    'Data': ['Data Science', 'DBs', 'ElasticSearch', 'MongoDB', 'MySQL', 'MariaDB', 'PostgreSQL'],
    'DevOps': ['Clouds', 'Console', 'DevOps', 'Git', 'Gradle', 'Linux', 'Maven', 'Microservices', 'Network', 'PowerShell', 'Security'],
    'IoT': ['Arduino', 'IoT', 'Raspberry Pi'],
    'Other': [ 'Axure UX', 'Blender', 'Games', 'Jira', 'LaTeX', 'OpenCV', 'Other', 'PM', 'Spark', 'Testing', 'Unity', 'Unreal Engine', 'UX Design']
};
app.get('/book-lists', function(req, res) {
    const preconfiguredSubCategories = {};
    preconfiguredAvailableCategories.forEach(category => preconfiguredSubCategories[category] = new Set([...preconfiguredAvailableSubcategories[category]]));
    Book.find({}, 'tags publisher sources category subcategory', function(err, books) {
        if (err) return console.error(err);
        const sets = books.reduce(
            (available, book) => {
                available.publishers.add(book.publisher);
                book.sources.forEach(source => available.sourceNames.add(source.name));
                if (!available.categories.has(book.category)) {
                    available.categories.add(book.category);
                    available.subcategories[book.category] = new Set();
                }
                available.subcategories[book.category].add(book.subcategory);
                book.tags.forEach(available.tags.add, available.tags);
                return available;
            },
            {
                publishers: new Set(),
                sourceNames: new Set(),
                categories: new Set(preconfiguredAvailableCategories),
                subcategories: preconfiguredSubCategories,
                tags: new Set(preconfiguredTags)
            }
        )
        sets.categories.forEach(category => sets.subcategories[category] = [...sets.subcategories[category]].sort())
        res.send({
            publishers: [...sets.publishers].sort(caseInsensitiveComparator),
            sourceNames: [...sets.sourceNames].sort(caseInsensitiveComparator),
            categories: [...sets.categories].sort(caseInsensitiveComparator),
            subcategories: sets.subcategories,
            tags: [...sets.tags].sort(caseInsensitiveComparator),
        });
    });
})



app.get('/history', function(req, res){
    Book.find({readings: { $exists: true, $ne: []}}, {id: 1, title: 1, readings: 1}, function (err, books) {
        if (err) return console.error(err);
        const readings = books.reduce((r, book) => {
            return r.concat(book.readings.map(reading => {return {bookId: book._id, bookTitle: book.title, date: reading.date, note: reading.note}}));
        }, []);
        readings.sort((r1, r2) => r2.date.localeCompare(r1.date));
        res.send(readings);
    })
    //     .sort({'attributesSortString': 1, 'publishedYear': -1, 'title': 1}).then((books) => {
    //     const pageSize = 10;
    //     const maxPage = Math.ceil(books.length / pageSize);
    //     const page = req.query.page;
    //     const currentPage = page > maxPage ? 1 : page;
    //     const startBook = (currentPage - 1) * pageSize;
    //     res.send({ books: books.slice(startBook, startBook + pageSize).map(mapBookForReturn), currentPage: currentPage, maxPage: maxPage });
    // });
});







//////////////////////
// admin update all //
//////////////////////
// app.put('/books', function(req, res) {
//     Book.find({}, function (err, books) {
//         if (err) return console.error(err);
//         books.forEach(book => {
//             if (adminUpdate6(book)) {
//                 console.log(book.edition);
//                 book.save().then(() => res.status(200).end()).catch(()=> {});
//             }
//         });
//         res.send('finished');
//     });
// });
adminUpdate0 = function(book) {
    if (book.attributesSortString === null || book.attributesSortString === undefined) {
        book.attributesSortString = `${book.archived ? '1' : '0'}`
            + `${book.marked ? '0' : '1'}`
            + `${book.state === 'current' ? '0' : book.state === 'paused' ? '1' : book.state === 'finished' ? '2' : '3'}`
            + `${book.recommendation === 'recommended' ? '0' : book.recommendation === 'notRecommended' ? '2' : '1'}`;
        return true;
    }
    return false;
}
adminUpdate1 = function(book) {
    if (book.subCategory !== null && book.subCategory !== undefined) {
        book.subcategory = book.subCategory;
        book.subCategory = undefined;
        return true;
    }
    return false;
}
adminUpdate2 = function(book) {
    if (book.starred !== null && book.starred !== undefined) {
        book.marked = book.starred;
        book.starred = undefined;
        return true;
    }
    return false;
}
adminUpdate3 = function(book) {
    book.subcategory = 'Angular';
    return true;
}
adminUpdate4 = function(book) {
    if (book.marked === null || book.marked === undefined) {
        book.marked = false;
    }
    return true;
}
adminUpdate5 = function(book) {
    const d = new Date();
    if (book.createdAt === undefined) {
        const createdAt = `${d.getFullYear()}-${d.getMonth() < 9 ? '0' : ''}${d.getMonth() + 1}-${d.getDate() < 10 ? '0' : ''}${d.getDate()}`
        book.createdAt = createdAt;
        return true;
    }
    return false;
}
adminUpdate6 = function(book) {
    if (book.media === null || book.media === undefined) {
        book.media = 'ebook';
        book.type = undefined;
        return true;
    }
    if (book.description === 'null') {
        book.description = '';
        return true;
    }
    return false;
}

app.listen(port, function() {
    console.log(`server has started on port ${port} on ${env} environment`);
});
