const { MongoClient } = require('mongodb');

const url = "mongodb+srv://arvinsamuel:SelvaSam123%23@arvinsamuela.t1l3o.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(url);


async function renameField() {
    // Connection URI (replace with your MongoDB connection string)
    try {
        // Connect to MongoDB
        await client.connect();
        const db = client.db("EnviroHelp"); // Replace with your database name
        const collection = db.collection("campaign"); // Replace with your collection name

        // Rename the field
        const result = await collection.updateMany(
            {}, // Empty filter to match all documents
            { $rename: { "conatct": "contact" } } // Rename 'user_age' to 'age'
        );

        console.log(`Modified ${result.modifiedCount} documents`);
    } catch (error) {
        console.error("Error renaming field:", error);
    } finally {
        // Close the connection
        await client.close();
    }
}

// Run the function
renameField();