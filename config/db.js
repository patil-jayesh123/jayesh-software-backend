const mongoose=require('mongoose')

const connection=async()=>{
    try{
        await mongoose.connect('mongodb+srv://jayeshpatilAtlas:Jayu8262@cluster0.9in5uyp.mongodb.net/notebook')
        console.log("DB connect successfully");        
    }catch(err){
        console.log("failed to connect");        
    }
}

module.exports=connection